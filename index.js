var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http, {path: '/socket.io', 'pingInterval': 2000, 'pingTimeout': 5000});
	//io.set('close timeout', 60);
	// as per last test min 2500 value is required.
  // io.set('heartbeat interval', 5);
  // io.set('heartbeat timeout', 11);


var mysql = require('mysql');
var connection = mysql.createConnection({
  host     : '195.154.173.110',
  user     : 'rummyuser',
  password : 'KuTHl&i',
  database : 'rummydb'
});
connection.connect(function(err) {
  if (err) return console.log(err);
  console.log('You are now connected...')
});  

connection.query('SELECT * from players', function (err, rows, fields) {
  if (err) throw err

  console.log('The solution is: ', rows)
});

connection.end();


app.get('/chat',function(req,res){
	res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
  
  console.log('a user connected: ',socket.id);
 // console.log(socket);
  socket.on('disconnect', function(){
    console.log('user disconnected: ',socket.id);
    //console.log(socket);
    var thisuser = socket.id;
    var msgToSend = '{"type":"code","msg":"dissconnected","userid":"'+thisuser+'"}';
    io.emit('chat message', msgToSend);
  });

  socket.on('chat message', function(msg){
    socket.broadcast.emit('chat message', msg);
  });

   socket.on('joinRoom', function(msg){
    io.emit('joinRoom', msg);
  });

   socket.on('allmsg', function(msg){
     io.emit('chat message', msg);
   });
/*
  socket.on('ping', function() {
    socket.emit('pong');
  });
*/
});

app.get('/automessage',function(req, res){  
  io.emit('chat message', 'This is an Auto Message');
  res.send('Message Sent');
});

http.listen(process.env.PORT || 8080, function(){
	console.log('Listening on port: 8080');
});
