var net = require("net"),
		sys = require("sys");

// a quick client for basic IRC
// (see example below)
function irc_client(server, port, ondatafunc)
{
	this.conn = net.createConnection(port, server);
	this.ondata = ondatafunc;
	this.autopong = true;
	this.send = function(command, payload)
	{
		this.conn.write(command + " " + payload + "\r\n");
	};
	this.login = function(nick, user_string)
	{
		this.send('NICK', nick);
		this.send('USER', user_string);
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
