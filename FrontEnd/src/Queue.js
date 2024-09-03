import { useState, useEffect, useCallback, useRef } from 'react';
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

function AlertDismissibleExample({ show, handleClose, alertMessage }) {
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
        {alertMessage}
      </Modal.Body>
      <Modal.Footer className="border-top-0 justify-content-center">
        <Button variant="outline-danger" onClick={handleClose}>
          Okay
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function useQueueTimer(inQueue) {
  const [time, setTime] = useState('00:00');
  const startTimeRef = useRef(0);

  useEffect(() => {
    let intervalId;
    if (inQueue) {
      startTimeRef.current = new Date().getTime();
      setTime('00:00'); // Reset the time immediately when joining queue
      
      intervalId = setInterval(() => {
        const now = new Date().getTime();
        const distance = now - startTimeRef.current;
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
        const seconds = Math.floor((distance % (1000 * 60)) / 1000).toString().padStart(2, '0');
        setTime(`${minutes}:${seconds}`);
      }, 1000);
    } else {
      setTime('00:00'); // Reset the time when leaving queue
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [inQueue]);

  return time;
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
  const [checkCount, setCheckCount] = useState(0);
  const time = useQueueTimer(inQueue);


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
        clearInterval(timerInterval)
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
        console.log("this is inQueue :3", data.inQueue)
        if(data.inQueue == 1) {
          setInQueue(true)
        }
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
    let timeoutId;
    if (inQueue) {
      const checkIntervals = [1000, 1000, 2000, 2000, 10000, 15000];
      const scheduleNextCheck = () => {
        const interval = checkCount < checkIntervals.length ? checkIntervals[checkCount] : checkIntervals[checkIntervals.length - 1];
        timeoutId = setTimeout(() => {
          checkQueueStatus();
          setCheckCount(prevCount => prevCount + 1);
          scheduleNextCheck();
        }, interval);
      };
      scheduleNextCheck();
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [inQueue, checkCount]);

  const checkQueueStatus = async () => {
    try {
      const response = await fetch('/api/user', {
        method: 'GET',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.inQueue !== 1) {
          setInQueue(false);
          clearInterval(timerInterval);
          setTimerInterval(null);
          const button = document.getElementById("queueBtn");
          button.className = "btn btn-lg btn-success btn-change";
          button.textContent = "Join Queue";
          setAlertMessage("You have been removed from the queue.");
          setShowAlert(true);
        }
      }
    } catch (error) {
      console.error('Error checking queue status:', error);
    }
  };

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
      clearInterval(timerInterval)
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
      console.log("hihihi")

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

  }, [inQueue])

  const buttonClass = inQueue 
    ? "btn btn-outline-secondary btn-lg disabled"
    : isLoggedIn 
      ? "btn btn-lg btn-success btn-change"
      : "btn btn-lg btn-primary";
  const buttonText = inQueue ? time : isLoggedIn ? "Join Queue" : "Login to Queue";

  return (
  <>
    <div className="d-grid gap-2 col-3 mx-auto QueueButtonDiv">
      <button
        id="queueBtn"
        type="button"
        className={buttonClass}
        onClick={handleButtonClick}
      >
        {buttonText}
      </button>
      <p className="text-center" id="pplInQueue">
        0 people in queue
      </p>
      <div id="fakeModalTitle" style={{ display: 'none' }}></div>
      <MatchFound show={show} handleClose={handleClose} username={username} gameId={gameId} socket={socket} />
    </div>
    <div>
    <AlertDismissibleExample show={showAlert} handleClose={handleCloseAlert} alertMessage={alertMessage} />
    </div>
  </>
  );
}

export default Queue;