var net = require("net"),
		sys = require("sys");

var irc = exports;

// a quick client for basic IRC
// (see example below)
irc.irc_client = function (server, port, ondatafunc)
{
	this.conn = net.createConnection(port, server);
	this.ondata = ondatafunc;
	this.autopong = true;
	this._buffered_messages = [];
	this._inited = false;
	this.send = function(command, payload)
	{
		if (!this._inited)
		{
			this._buffered_messages.push({c: command, p: payload});
			sys.puts("buffering");
			return;
		}
		this.conn.write(command + " " + payload + "\r\n");
		if (command == "QUIT") this.conn.end();
		sys.puts('irc: "' + command + " " + payload + '"');
	};
	this.login = function(nick, user_string)
	{
		//sys.puts('logging in with "NICK '+nick+'" and "USER '+user_string+'"');
		this._inited = true;
		this.send('NICK', nick);
		this.send('USER', user_string);

		if (this._buffered_messages.length > 0)
		{
			var msg = this._buffered_messages.shift();
			while (msg != undefined)
			{
				this.send(msg.c, msg.p);
				msg = this._buffered_messages.shift();
			}
		}
	};
	this.pong = function(server) { this.send('PONG', server); };
	this._ondata = function(data)
	{
		var _data = data;
		if (Buffer.isBuffer(_data)) _data = _data.toString('utf8');
		if (this.autopong && (/PING/).test(_data))
		{
			var split_data = _data.split(' ', 2);
			this.pong(split_data[1]);
		}
		else
		{
			this.ondata(data);
		}
	}
	this.conn.on('data', this._ondata.bind(this));
}

/*var inited = false;

var myconn = new irc_client('localhost', 6667, function(data)
		{
			sys.puts(data);
			if (!inited)
			{
				myconn.login('test', 'test 8 * :test user');	
				inited = true;
			}
		});
		*/
