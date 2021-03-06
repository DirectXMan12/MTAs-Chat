HOST = null; // localhost
PORT = 8001;
CHANNEL_NAME = "mtas_irc";

// when the daemon started
var starttime = (new Date()).getTime();

var mem = process.memoryUsage();
// every 10 seconds poll for the memory.
setInterval(function () {
  mem = process.memoryUsage();
}, 10*1000);


var fu = require("./fu"),
    sys = require("sys"),
    url = require("url"),
    qs = require("querystring"),
		irc = require("./testirc") ;

var MESSAGE_BACKLOG = 200,
    SESSION_TIMEOUT = 60 * 1000;

var LISTENER;

var channel = new function () {
  var messages = [],
      callbacks = [];

  this.appendMessage = function (nick, s, type, text) {
    var m = { nick: nick
            , type: type // "msg", "join", "part"
            , text: text
            , timestamp: (new Date()).getTime()
            };

    switch (type) {
      case "msg":
        sys.puts("<" + nick + "> " + text);
        break;
      case "join":
        sys.puts(nick + " join");
        break;
      case "part":
        sys.puts(nick + " part");
        break;
    }

    messages.push( m );
		type = type.toUpperCase();
		switch (type)
		{
			case "JOIN":
				text = "#"+CHANNEL_NAME;
				break;
			case "PART":
				text = "#"+CHANNEL_NAME;
				break;
			case "MSG":
				type = 'PRIVMSG #'+CHANNEL_NAME;
				if (text.substr(0, 3) == '/me') text = "\001ACTION " + text.substr(4) + "\001";
				else if (text.substr(0, 5) == '/roll') text = "\001ACTION " + text.substr(6) + "\001";
				text = ':'+text;
				break;
		}
		if (s != undefined) s.irc_channel.send(type, text);
		if (type == "PART" && s != undefined) s.irc_channel.send("QUIT", '');

    while (callbacks.length > 0) {
      callbacks.shift().callback([m]);
    }

    while (messages.length > MESSAGE_BACKLOG)
      messages.shift();
  };

  this.query = function (since, callback) {
    var matching = [];
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (message.timestamp > since)
        matching.push(message)
    }

    if (matching.length != 0) {
      callback(matching);
    } else {
      callbacks.push({ timestamp: new Date(), callback: callback });
    }
  };

  // clear old callbacks
  // they can hang around for at most 30 seconds.
  setInterval(function () {
    var now = new Date();
    while (callbacks.length > 0 && now - callbacks[0].timestamp > 30*1000) {
      callbacks.shift().callback([]);
    }
  }, 3000);
};

var sessions = {};

function createSession (nick) {
  if (nick.length > 50) return null;
  if (/[^\w_\-^!]/.exec(nick)) return null;

  for (var i in sessions) {
    var session = sessions[i];
    if (session && session.nick === nick) return null;
  }

  var session = { 
    nick: nick, 
    id: Math.floor(Math.random()*99999999999).toString(),
    timestamp: new Date(),

    poke: function () {
      session.timestamp = new Date();
    },

    destroy: function () {
      channel.appendMessage(session.nick, session, "part");
      delete sessions[session.id];
    },
		irc_inited: false,
		irc_channel: new irc.irc_client('localhost', 6667, function(data)
			{
				if (!session.irc_inited) { session.irc_channel.login(session.nick, session.nick + ' 8 * :'+session.nick+' web user'); session.irc_inited = true; }
				//sys.puts(data);
			})
  };

  sessions[session.id] = session;
  return session;
}

// interval to kill off old sessions
setInterval(function () {
  var now = new Date();
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];

    if (now - session.timestamp > SESSION_TIMEOUT) {
      session.destroy();
    }
  }
}, 1000);

fu.listen(Number(process.env.PORT || PORT), HOST);

fu.get("/", fu.staticHandler("index.html"));
fu.get("/style.css", fu.staticHandler("style.css"));
fu.get("/client.js", fu.staticHandler("client.js"));
fu.get("/jquery-1.2.6.min.js", fu.staticHandler("jquery-1.2.6.min.js"));

LISTENER = new irc.irc_client('localhost', 6667, function(data)
    {
      if(!LISTENER._inited) { LISTENER.login('mtas_listener', 'mtas_listener 8 * :listens to the mtas_irc channel for webclients'); LISTENER.send('JOIN', '#'+CHANNEL_NAME); }
      var data_parts = data.toString().split(' ');
      var user_parts = data_parts[0].split('!');

      var type = "";
      var text = undefined;
      var known = true;

      switch(data_parts[1])
      {
        case 'JOIN':
          type = 'join';
          break;
        case 'PART':
          type = 'part';
          break;
				case 'PRIVMSG':
          type = 'msg';
          text = data_parts[3].substr(1);
          if (text.substr(0,7) == "\001ACTION") { text = text.substring(7,-2); text = '/me' + text; }
					for (var i = 4; i < data_parts.length; i++) text += ' ' + data_parts[i];
          break;
        default:
          known = false;
          break;
      }
			
			var nick = user_parts[0].substr(1);	
			for (var i in sessions)
			{
				var session = sessions[i];
				if (session && session.nick === nick) known = false;
			}

      if (known) { channel.appendMessage(nick, undefined, type, text); }
			//else sys.puts('unknown command - ' + data.toString().substr(0,20));
    });

fu.get("/who", function (req, res) {
  var nicks = [];
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];
    nicks.push(session.nick);
  }
  res.simpleJSON(200, { nicks: nicks
                      , rss: mem.rss
                      });
});

fu.get("/join", function (req, res) {
  var nick = qs.parse(url.parse(req.url).query).nick;
  if (nick == null || nick.length == 0) {
    res.simpleJSON(400, {error: "Bad nick."});
    return;
  }
  var session = createSession(nick);
  if (session == null) {
    res.simpleJSON(400, {error: "Nick in use"});
    return;
  }

  //sys.puts("connection: " + nick + "@" + res.connection.remoteAddress);

  channel.appendMessage(session.nick, session, "join");
  res.simpleJSON(200, { id: session.id
                      , nick: session.nick
                      , rss: mem.rss
                      , starttime: starttime
                      });
});

fu.get("/part", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.destroy();
  }
  res.simpleJSON(200, { rss: mem.rss });
});

fu.get("/recv", function (req, res) {
  if (!qs.parse(url.parse(req.url).query).since) {
    res.simpleJSON(400, { error: "Must supply since parameter" });
    return;
  }
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.poke();
  }

  var since = parseInt(qs.parse(url.parse(req.url).query).since, 10);

  channel.query(since, function (messages) {
    if (session) session.poke();
    res.simpleJSON(200, { messages: messages, rss: mem.rss });
  });
});

fu.get("/send", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var text = qs.parse(url.parse(req.url).query).text;

  var session = sessions[id];
  if (!session || !text) {
    res.simpleJSON(400, { error: "No such session id" });
    return;
  }

  session.poke();

  channel.appendMessage(session.nick, session, "msg", text);
  res.simpleJSON(200, { rss: mem.rss });
});
