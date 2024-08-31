import { useState, useEffect, useCallback } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Alert from 'react-bootstrap/Alert';
import './App.css';
import MatchFound, { startTimer } from './MatchFound';
import { useNavigate } from 'react-router-dom';
import { useModal } from './MatchFound';
import { AlertTriangle } from 'lucide-react';

/*
function AlertDismissibleExample({ show, handleClose }) {
  return(
    <>
        <Modal
          show={show}
          onHide={handleClose}
          backdrop="static"
          aria-labelledby="contained-modal-title-vcenter"
          centered
          keyboard={false}
          className=""
        >
          <Modal.Header className="modal-header border-bottom-0 justify-content-center padding-bottom-0!important">
            <Modal.Title>
            Error
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="modal-body text-center">You must leave your game in order to queue.</Modal.Body>
          <Modal.Footer className="justify-content-center border-top-0">
            <Button id="acceptBtn" variant="primary" onClick={handleClose}>Okay</Button>
          </Modal.Footer>
        </Modal>
      </>
    );
}

*/

function AlertDismissibleExample({ show, handleClose }) {
  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      size="sm"
    >
      <Modal.Header className="bg-danger text-white border-bottom-0">
        <Modal.Title className="d-flex align-items-center">
          <AlertTriangle className="me-2" />
          Error
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center py-4">
        You must leave your game in order to queue.
      </Modal.Body>
      <Modal.Footer className="border-top-0 justify-content-center">
        <Button variant="outline-danger" onClick={handleClose}>
          Okay
        </Button>
      </Modal.Footer>
    </Modal>
  );
}



function Queue() {

  const { show, handleClose, handleShow } = useModal();
  const [queueEventSource, setQueueEventSource] = useState(null);
  const [inQueue, setInQueue] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [gameId, setGameId] = useState(null)
  const [inGame, setInGame] = useState(0)
  const navigate = useNavigate();
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [timerInterval, setTimerInterval] = useState(null);

  const handleCloseAlert = () => setShowAlert(false)
  const handleShowAlert = () => setShowAlert(true)

  const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/heartbeat?username=${username}`;

  const connectWebSocket = useCallback(() => {
    const newSocket = new WebSocket(url);
    console.log("trying to connect or something haha wait did i even cache..")

    newSocket.onopen = () => {
        console.log('WebSocket connection established');
        
        setIsConnected(true);
        setInQueue(true)
    };

    newSocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'pong') {
            console.log('Received pong from server');
        } else if (message.type === 'queueUpdate') {
            console.log(message.payload)
        }
    };

    newSocket.onclose = () => {
        console.log('WebSocket connection closed. Attempting to reconnect...');
        setIsConnected(false);
        setInQueue(false);
        setTimerInterval(null)
        const button = document.getElementById("queueBtn")
        button.className = "btn btn-lg btn-success btn-change"
        button.textContent = "Join Queue"
        //setTimeout(connectWebSocket, 5000);
    };

    newSocket.onerror = (error) => {
        console.error(`WebSocket error: ${error}`);
    };

    setSocket(newSocket);
  }, [username]);

  const checkLoginStatus = async () => {
    try {
      const response = await fetch('/api/user', {
        method: 'GET',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        console.log("THE USERNAME IS", data.username)
        console.log("queue gameId is: ", data.gameId)
        console.log("ingame? :", data.inGame)
        setUsername(data.username);
        setGameId(data.gameId)
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch (error) {
      console.error('Error checking login status:', error);
      setIsLoggedIn(false);
    }
  };

  useEffect(() => {
    checkLoginStatus();
  }, [])

  useEffect(() => {

    // Set up the EventSource when the component mounts
    const eventSource = new EventSource('/queuenumbers');
    setQueueEventSource(eventSource);

    eventSource.addEventListener('message', (event) => {
      const message = event.data;
      document.getElementById("pplInQueue").textContent = message;
      console.log('Received Message: ', message);
    });

    eventSource.addEventListener('error', (error) => {
      console.error('Error occurred: ', error);
    });

    // Clean up the EventSource when the component unmounts
    return () => {
      setInQueue(false)
      eventSource.close()
      setQueueEventSource(null)
      console.log('EventSource closed');
    };
  }, [inQueue, username]);

  function handleButtonClick() {
    if (!isLoggedIn) {
      navigate('/login');
    } else {
      click();
    }
  }

  function click() {

    const button = document.getElementById("queueBtn")
    button.className = "btn btn-outline-secondary btn-lg disabled"
    button.textContent = "00:00"
    var now = new Date().getTime();
    var x = setInterval(function() {
  
      // Get today's date and time
      var live = new Date().getTime();
    
      // Find the distance between now and the count down date
      var distance = live - now;
    
      // Time calculations for days, hours, minutes and seconds
      var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
      var seconds = Math.floor((distance % (1000 * 60)) / 1000).toString().padStart(2, '0');
    
      // Display the result in the element with id="demo"
      document.getElementById("queueBtn").textContent = minutes + ":" + seconds + "";
    
      // If the count down is finished, write some text
      if (distance < 0) {
        clearInterval(x);
      }
    }, 1000);
    setTimerInterval(x)
    fetch("/queue", {
      method: "POST",
      credentials: "include",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        "username": username,
        "inQueue": "1"
      })
    })
    .then((res) => res.json())
    .then((data) => {
      console.log(data);
      setInQueue(true)
      connectWebSocket()
    })
    .catch((err) => {
      clearInterval(x)
      console.log(err.message);
      button.className = "btn btn-lg btn-success btn-change"
      button.textContent = "Join Queue"
      setAlertMessage(err.message);
      setShowAlert(true);
      setInQueue(false);
    })
  
  }

  useEffect(() => {

    let inQueueEventSource

    if(inQueue){

      const inQueueEventSource = new EventSource('/api/inqueue');

      inQueueEventSource.addEventListener('message', (event) => {
        const message = event.data;
        if(/MATCH FOUND:/.test(message)){
          console.log("ITS THE INQUEUEEVENTSOURCE YA DINGUS")
          setGameId(message.slice(-5))
          //setGameId("test1")
          handleShow()
          clearInterval(timerInterval)
          setTimerInterval(null)
          const button = document.getElementById("queueBtn")
          button.className = "btn btn-success btn-lg btn-change"
          button.textContent = "Join Queue"
          inQueueEventSource.close()
        }
        console.log('Received Message: ', message)
      });
    
      inQueueEventSource.addEventListener('error', (error) => {
        console.error('Error occurred: ', error);
      });

    }

    return(() => {
      if(inQueueEventSource){
        inQueueEventSource.close()
      }
    })

  }, [inQueue, timerInterval])

  return (
  <>
    <div className="d-grid gap-2 col-3 mx-auto QueueButtonDiv">
      <button
        id="queueBtn"
        type="button"
        className={`btn btn-lg ${isLoggedIn ? 'btn-success btn-change' : 'btn-primary'}`}
        onClick={handleButtonClick}
      >
        {isLoggedIn ? 'Join Queue' : 'Login to Queue'}
      </button>
      <p className="text-center" id="pplInQueue">
        0 people in queue
      </p>
      <div id="fakeModalTitle" style={{ display: 'none' }}></div>
      <MatchFound show={show} handleClose={handleClose} username={username} gameId={gameId}/>
    </div>
    <div>
    <AlertDismissibleExample show={showAlert} handleClose={handleCloseAlert} />
    </div>
  </>
  );
}

export default Queue;