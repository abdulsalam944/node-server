var apiUrl = "http://www.1strummy.in/rummy-game/ajax/";
var app = require('express')();
//var http = require('http').Server(app);
var fs = require('fs');
var https = require('https');


var options = {
  key: fs.readFileSync('./privkey.pem'),
  cert: fs.readFileSync('./cert.pem')
};
var serverPort = 443;
var server = https.createServer(options, app);


var request = require('request');
var io = require('socket.io')(server, {path: '/socket.io', 'pingInterval': 2000, 'pingTimeout': 5000});
//io.set('close timeout', 60);
//as per last test min 2500 value is required.
//io.set('heartbeat interval', 5);
//io.set('heartbeat timeout', 11);
//console.log(' /* Request to Server */ ', apiUrl+'getThrowCardFromShuffledDeck.php');


// console.log(' /*******/ ');

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

// connection.query('SELECT * from players', function (err, rows, fields) {
//   if (err) throw err

//   console.log('The solution is: ', rows)
// });

//connection.end();


app.get('/chat',function(req,res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
  
  //console.log('a user connected: ',socket.id);
 // console.log(socket);
  socket.on('disconnect', function(){


    setTimeout(function(){

    //console.log('user disconnected: ',socket.id);

    var query = "select user_id, session_key from user_connection where connection_id = '"+socket.id+"'";
    connection.query(query,function(err,results){
      if(err) throw err;

      if(results.length==1){            
        var curUserId = results[0].user_id;
        var sessionId = results[0].session_key;
        //check if alreadyDissconnected
        connection.query("select * from dissconnection_detected_by_bot where room = '"+sessionId+"' and user = '"+curUserId+"'",function(err,res){

          if(res.length==0){

            //insert this user to db
            var query = "insert into dissconnection_detected_by_bot set room = '"+sessionId+"', user = '"+curUserId+"' ";
            connection.query(query,function(err, res){
              if(err) throw err;

              //console.log('One dissconnected user inserted','DB : dissconnection_detected_by_bot','User: '+curUserId,'Session: '+sessionId);

              //check if this user is diconnected during his gameplay
              var sql = "select game_running.current_player, game_running.card_pulled, game_running.game_id , (select CONCAT(card_pull,card_discard) from player_gamedata where player_gamedata.session_key = game_running.session_key and player_gamedata.user_id = game_running.current_player ) as pull_discard from game_running where game_running.session_key ='"+sessionId+"' and game_running.current_player =  '"+curUserId+"'";
             // console.log(sql);
              connection.query(sql,function(err,res){
               // console.log(res);
                if(res.length>0){

                //  console.log('Dissconnected user is current player. Bot will not handle Autoplay.');

                  var cardPulled = "";

                  if(res[0].pull_discard == "10"){ // 1-0 means cardpulled but not discarded.
                    cardPulled = res[0].card_pulled;                    
                    discard_during_gameplay(curUserId, sessionId, cardPulled);
                  }else{  /*if(res[0].pull_discard == "00")*/ 
                    discard_during_gameplay(curUserId, sessionId, cardPulled="");
                  // 0-0 means card card not pull and discarded
                    
                  // }else{
                  //   console.log("Unknown error.. Need to check above logic...");
                  }

                }else{
                  console.log('Dissconnected user is not current player, Auto play will be handled during card discard.');
                }

              });



            });

          }else{
            console.log('This user is already inserted to db.');
          }


        });

      }else{
        console.log('False dissconnected signal recieved.');
      }
      
    });

    // Sending disconnect message to client

   // console.log(socket);
    var thisuser = socket.id;
    var msgToSend = '{"type":"code","msg":"dissconnected","userid":"'+thisuser+'"}';
    io.emit('chat message', msgToSend);

    },3000);


  });

  socket.on('chat message', function(msg){
    socket.broadcast.emit('chat message', msg);
    
    /*
      Auto bot start
    */
    console.log(msg);
    var m  = JSON.parse(msg);
    
    var room = m.room;
    var type = m.type;
    
    //discard_during_gameplay
    if(type == "start-counter-discard"){
      //userId, sessionId, cardPulled
     // console.log(m.type.player, room );
      setTimeout(function(){
     //   console.log(" ------------------ CARD PULL AFTER RESTART GAME ----------------"+(m.counterTime*1000));
        discard_during_gameplay(m.type.player, room, cardPulled = "");
      },(m.counterTime*1000));     

    }else if(type=="card-discarded"){
      //this function is called  after card discard by any player to check next palyer is dissconnected or not.
      discarded(m);

    }else if(type=="code" && m.msg == "re-connect"){
      var oldUser = m.oldid;
      var newUser = m.newid; 

      // On reconnect, delete user from dissconnected table
      var query = "select * from user_connection where connection_id = '"+oldUser+"' and session_key = '"+room+"' ";
     // console.log(query);
      connection.query(query,function(err,res){
        if(err) throw err;

      //  console.log('Res: ',res);
        if(res.length){
          var query  = " delete from dissconnection_detected_by_bot where room = '"+res[0].session_key+"' and user = '"+res[0].user_id+"' ";
       //   console.log(query);
          connection.query(query,function(err,res){
            if(err) throw err;
         //   console.log('User found in dissconnected table and removed from table succesfully.');            
          });
        }

      });


    }




  // connection.query('SELECT * from players', function (err, rows, fields) {
  //   if (err) throw err

  //   console.log('The solution is: ', rows)
  // });


    //{"room":"000004","type":"card-discarded","message":"discard done","player":"1", "cardDiscarded":"3OFspades","nextPlayer":2}


    /*
    Auto bot ends
  */
  });

   socket.on('joinRoom', function(msg){
    //console.log('joinRoom', msg);
    io.emit('joinRoom', msg);
  });
   //console.log('Join ROom');
   //socket.emit('joinRoom', 'hello world');

   socket.on('allmsg', function(msg){

      //console.log('Sending to all user',msg);

     io.emit('chat message', msg);
   });


function updatePoint(userId, sessionId){

  console.log('Update Points function called...');

    var ajxDataCheckDropType = { form: {'action': 'check-drop-type', sessionKey: sessionId, player: userId} };
    console.log(ajxDataCheckDropType);
    request.post(apiUrl+'checkDropType.php', ajxDataCheckDropType, function (error, response, body) {
      console.log(response.statusCode, body);
      if (response.statusCode == 200 && body) {
        var count = body;
        // get game type 
        var gameTypeAjax = {form:{ sessionId:sessionId }};
        console.log(gameTypeAjax);
         request.post(apiUrl+'getGameType.php', gameTypeAjax, function (error, response, body) {
            console.log(response.statusCode, body);
            if (response.statusCode == 200 && body) {

                var temp = JSON.parse(body);;

                var gameTypeCookie = temp.type;
                var gamePlayersCookie = temp.gamePlayersCookie;
                var pointToUpdate = 0;
                //   calculate point
                if(count == 0 && gameTypeCookie == "score"){ // Score game drop
                  if(gamePlayersCookie == "2"){
                      pointToUpdate = 10;
                  }else if(gamePlayersCookie == "6"){
                      pointToUpdate = 10;                      
                  }
                }else if(count == 1 && gameTypeCookie == "score"){ // Score game middle drop
                  if(gamePlayersCookie == "2"){
                    pointToUpdate = 30;                      
                  }else if(gamePlayersCookie == "6"){
                    pointToUpdate = 30;
                  }                  
                }else if(count == 0 && gameTypeCookie == "101"){ // Pool game drop
                  if(gamePlayersCookie == "2"){
                      pointToUpdate = 20;
                  }else if(gamePlayersCookie == "6"){
                      pointToUpdate = 20;
                  }
                }else if(count == 1 && gameTypeCookie == "101"){ // Score game middle drop
                  if(gamePlayersCookie == "2"){
                    pointToUpdate = 40;
                  }else if(gamePlayersCookie == "6"){
                    pointToUpdate = 40;
                  }
                }else if(count == 0 && gameTypeCookie == "201"){ // Pool game drop
                  if(gamePlayersCookie == "2"){
                    pointToUpdate = 25;
                  }else if(gamePlayersCookie == "6"){
                    pointToUpdate = 25;
                  }
                }else if(count == 1 && gameTypeCookie == "201"){ // Pool game drop
                  if(gamePlayersCookie == "2"){
                    pointToUpdate = 50;
                  }else if(gamePlayersCookie == "6"){
                    pointToUpdate = 50;
                  }
                }


                if(pointToUpdate!=0){
                  var ajxDataCheckDropType = { form: {sessionKey: sessionId, player: userId, points:pointToUpdate, gameTypeCookie:gameTypeCookie} };
                  console.log(ajxDataCheckDropType);
                  request.post(apiUrl+'updatePoints.php', ajxDataCheckDropType, function (error, response, body) {
                    console.log(response.statusCode, body);
                  });
                }




            }else{
              console.log(error, response);
            }

         });


      }else{
        console.log(error, response);
      } 
    });

    console.log('Point update completes..');
}

function checkIfNextUserIsDissconnectedAndDroped(userId, sessionId){
  // may be in future..
}

function discard_during_gameplay(userId, sessionId, cardPulled){

console.log('Discard during gameplay....')
  


                      var playersTmp = [];
                      console.log('userId',sessionId);
                      console.log('sessionId',sessionId);
                      console.log('cardPulled',sessionId);
                      var dataToSend = { form: {roomId: sessionId} };
                      console.log('Temp Player',apiUrl+'getTempUser.php',dataToSend);
                      request.post(apiUrl+'getTempUser.php',dataToSend,
                      function (error, response, body) {
                        console.log(response.statusCode);
                        if (response.statusCode == 200 && body) {
                            playersTmp = body.trim();
                            playersTmp = playersTmp.split(',');
                            console.log('Temp Player recieved:', playersTmp);


// autoplay -----

  var room  = sessionId;
  var nextPlayer  = findNextPlayer(playersTmp,userId);
  // check drop count
  console.log('Check drop counter...');
  var ajxDataCheckAutoplayedCount = { form: {'action': 'check-drop-type', roomId: room, sessionKey: room, player: nextPlayer}};
  console.log(ajxDataCheckAutoplayedCount);
  request.post(apiUrl+'checkDropType.php', ajxDataCheckAutoplayedCount, function (error, response, body) {
    console.log(response, body);
      if (response.statusCode == 200 && body) {
          console.log('Played Time: ',parseInt(body.trim()));
          if(parseInt(body.trim()) > 0){

            //check autoplay count
            console.log('Check autoplay counter...');
            var ajxDataCheckAutoplayedCount = { form: {'action': 'check-autoplayed-count', roomId: room, sessionKey: room, player: nextPlayer} };
            console.log(ajxDataCheckAutoplayedCount);
            request.post(apiUrl+'checkAutoPlayedCount.php', ajxDataCheckAutoplayedCount, function (error, response, body) {
              console.log(response.statusCode, body);
                if (response.statusCode == 200 && body) {

                    if(parseInt(body.trim()) >= 3){

                      //update points
                      updatePoint(nextPlayer, room);

                      // clear interval and drop on middle this user
                      var dataToSend = {"room":room,"type":"code","msg":"card-drop-middle","player":nextPlayer};
                      io.sockets.emit('chat message', JSON.stringify(dataToSend));

                      checkIfNextUserIsDissconnectedAndDroped(nextPlayer,room);


                    }else{
                    
                       if(!cardPulled){
                              var query = "select * from game_running where session_key = '"+sessionId+"' ";
                              connection.query(query,function(req,res){
                                //console.log(res);
                                var dataToSend = { form: {action: 'get-card-from-deck', roomId: res[0].game_id, sessionKey: res[0].session_key} };
                                console.log(dataToSend);
                                request.post(apiUrl+'getThrowCardFromShuffledDeck.php',dataToSend,
                                function (error, response, body) {
                                  console.log(response.statusCode);
                                    if (response.statusCode == 200 && body) {
                                        console.log(body);
                                        var card = JSON.parse(body.trim());
                                        console.log(card.card_received);
                                        if(card.card_received){
                                          //send card pull signal
                                          var dataToSend = {"room":res[0].session_key,"type":"card-pulled-show-card","message":"card pulled","player":userId,"cardPulled":card.card_received};
                                          console.log(dataToSend);
                                          socket.broadcast.emit('chat message', JSON.stringify(dataToSend));                  
                                          //send card discard signal
                                          setTimeout(function(){
                                            //getNextPlayer
                                            console.log(playersTmp);
                                            console.log('Discarded..');
                                            var nextOfCurPlayer = findNextPlayer(playersTmp,userId);

                                           


                                            var dataToSend = {"room":res[0].session_key,"type":"card-discarded","message":"discard done","player":userId,"cardDiscarded":card.card_received,"nextPlayer":nextOfCurPlayer,playerTmp:playersTmp };
                                            console.log(dataToSend);
                                            io.sockets.emit('chat message', JSON.stringify(dataToSend)); 





                                            // removing discareded card from hand
                                            var dataToSend_ = { form: {room: res[0].session_key, player: userId, card: card.card_received} };
                                            request.post(apiUrl+'removeCardFromHand.php',dataToSend_,function(error, response, body){
                                                console.log(body);
                                            });


                                            // recalling same function again to check next user
                                            discarded(dataToSend);

                                          },5000);
                                        }
                                    }else{
                                      console.log(error, response);
                                    }        
                                });
                              });

                        }else{
                            //getNextPlayer
                            console.log(playersTmp);
                            console.log('Discarded..');
                            var nextOfCurPlayer = findNextPlayer(playersTmp,userId);
                            


                                       

                                        var dataToSend = {"room":sessionId,"type":"card-discarded","message":"discard done","player":userId,"cardDiscarded":cardPulled,"nextPlayer":nextOfCurPlayer,playerTmp:playersTmp };
                                        console.log(dataToSend);
                                        io.sockets.emit('chat message', JSON.stringify(dataToSend)); 
                                        // removing discareded card from hand
                                        var dataToSend_ = { form: {room: sessionId, player: userId, card: cardPulled} };
                                        request.post(apiUrl+'removeCardFromHand.php',dataToSend_,function(error, response, body){
                                            console.log(body);
                                        });


                                        discarded(dataToSend);
                        }       

                    }
                }
              });
  //if(parseInt(body.trim()) == 0 || parseInt(body.trim()) == "NaN")
            }else {
                console.log("Leaving Table");
                updatePoint(nextPlayer, room);
                var dataToSend = {"room":room,"type":"code","msg":"card-drop-first","player":userId};
                io.sockets.emit('chat message', JSON.stringify(dataToSend));
                checkIfNextUserIsDissconnectedAndDroped(nextPlayer,room);
            }

          
        }
      });
       

                        }else{
                          console.log(error, response);
                        } 





                      });


}

function discarded(m){ // This function will need to be called after card discard
    console.log('Card Discard function....');   
    
    var player = m.player;
    var room = m.room;
    var type = m.type;
    var nextPlayer = m.nextPlayer;
    var cardDiscarded = m.cardDiscarded;
    var playersTmp = m.playerTmp;

    // console.log(m);

    // if(room=="undefined"){
    //   var i = JSON.parse(m);
    //   room = i.form.
    // }
  
    //check next user dissconted or not
    console.log(room, nextPlayer );
    var query = "select * from dissconnection_detected_by_bot where room = '"+room+"' and user = '"+nextPlayer+"'";
    console.log(query);
    connection.query(query,function(err,res){
    if(err) throw err;
    
    if(res.length){

    

      //check user dissconnection type | Internet gone or Closed by him self
      var query = " select * from game_running where session_key = '"+room+"' and FIND_IN_SET('"+nextPlayer+"', dissconnected_user) > 0  ";
      console.log('Query: ',query);
      connection.query(query,function(err, res){
         if(err) throw err;



         if(res.length){
            console.log('Self dissconnected..'+nextPlayer);
         }else{

           // check drop count
            console.log('Check drop counter...');
            var ajxDataCheckAutoplayedCount = { form: {'action': 'check-drop-type', roomId: room, sessionKey: room, player: nextPlayer}};
            console.log(ajxDataCheckAutoplayedCount);
            request.post(apiUrl+'checkDropType.php', ajxDataCheckAutoplayedCount, function (error, response, body) {
              console.log(response.statusCode, body);
                if (response.statusCode == 200 && body) {
                    console.log('Played Time: ',parseInt(body.trim()));

                    if(parseInt(body.trim()) > 0){

                      //check autoplay count
                      console.log('Check autoplay counter...');
                      var ajxDataCheckAutoplayedCount = { form: {'action': 'check-autoplayed-count', roomId: room, sessionKey: room, player: nextPlayer} };
                      console.log(ajxDataCheckAutoplayedCount);
                      request.post(apiUrl+'checkAutoPlayedCount.php', ajxDataCheckAutoplayedCount, function (error, response, body) {
                        console.log(response.statusCode, body);
                          if (response.statusCode == 200 && body) {

                              if(parseInt(body.trim()) >= 3){
                                // clear interval and drop on middle this user
                                //update points
                                updatePoint(nextPlayer, room);

                                var dataToSend = {"room":room,"type":"code","msg":"card-drop-middle","player":nextPlayer};
                                io.sockets.emit('chat message', JSON.stringify(dataToSend));

                                //check if next player is dissconnected and droped

                              }else{
                               // auto play code will go here ////////////

                                var query = " select * from game_running where session_key = '"+room+"'";   
                                connection.query(query,function(err, res){
                                   if(err) throw err;


                                  var dataToSend = { form: {action: 'get-card-from-deck', roomId: res[0].game_id, sessionKey: res[0].session_key} };
                                  console.log('Internet gone of this user: '+nextPlayer);
                                  setTimeout(function(){

                                      // Auto Playcode start
                                      // check if user alredy pulls any card
                                      var query = "select * from game_running where session_key = '"+room+"' ";
                                      connection.query(query,function(req,res){

                                        //console.log(res);
                                        var dataToSend = { form: {action: 'get-card-from-deck', roomId: res[0].game_id, sessionKey: res[0].session_key} };
                                        console.log(dataToSend);
                                        request.post(apiUrl+'getThrowCardFromShuffledDeck.php',dataToSend,
                                        function (error, response, body) {
                                              console.log(response.statusCode);
                                                if (response.statusCode == 200 && body) {
                                                    console.log(body);
                                                    var card = JSON.parse(body.trim());
                                                    console.log(card.card_received);
                                                    if(card.card_received){                         

                                                      //send card pull signal
                                                      var dataToSend = {"room":res[0].session_key,"type":"card-pulled-show-card","message":"card pulled","player":nextPlayer,"cardPulled":card.card_received};
                                                      console.log(dataToSend);
                                                      socket.broadcast.emit('chat message', JSON.stringify(dataToSend));
                                                      
                                                      //send card discard signal
                                                      setTimeout(function(){

                                                        //getNextPlayer
                                                        console.log(playersTmp);
                                                        console.log('Discarded..');
                                                        var nextOfCurPlayer = findNextPlayer(playersTmp,nextPlayer);

                                                        


                                                        var dataToSend = {"room":res[0].session_key,"type":"card-discarded","message":"discard done","player":nextPlayer,"cardDiscarded":card.card_received,"nextPlayer":nextOfCurPlayer,playerTmp:playersTmp };
                                                        console.log(dataToSend);
                                                        io.sockets.emit('chat message', JSON.stringify(dataToSend)); 

                                                        // removing discareded card from hand
                                                        var dataToSend_ = { form: {room: res[0].session_key, player: nextPlayer, card: card.card_received} };
                                                        request.post(apiUrl+'removeCardFromHand.php',dataToSend_,function(error, response, body){
                                                            console.log(body);
                                                        });

                                                        discarded(dataToSend);
                                                        //socket.emit.apply('chat message', JSON.stringify(dataToSend));
                                                        //socket.emit('chat message', JSON.stringify(dataToSend));

                                                      },5000);

                                                    }

                                                }else{
                                                  console.log(error, response);
                                                }        
                                            }
                                        );

                                      });

                                  },5000);

                                });
                                  ////////////

                            }

                          }else{
                            console.log(error, response);
                          }

                      });

                    }else{
                        // send drop on first function
                        //update points
                        console.log("Leaving Table");
                        updatePoint(nextPlayer, room);
                        var dataToSend = {"room":room,"type":"code","msg":"card-drop-first","player":player};
                        io.sockets.emit('chat message', JSON.stringify(dataToSend));
                    }


                }else{
                  console.log(error, response);
                }

            });

         }

      });

    }else{
      console.log('Next user is connected to game.');
    }
  });
}




});

app.get('/automessage',function(req, res){  
  io.emit('chat message', 'This is an Auto Message');
  res.send('Message Sent');
});

server.listen(process.env.PORT || 8080, function(){
  console.log('Listening on port: 8080');
});


function findNextPlayer(players_, currentUser){

  var players = [];
  for(var i=0; i<players_.length;i++){
    players.push(parseInt(players_[i]));
  }


  if(players){
    var playersLength = (players.length - 1);
    var curUserPos = players.indexOf(parseInt(currentUser));

    if(playersLength == curUserPos){
      return players[0];
    }else{
      ++curUserPos;
      return players[curUserPos];
    }
  }
}

