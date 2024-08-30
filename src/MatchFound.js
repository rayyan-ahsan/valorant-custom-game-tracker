import React, { useState, useEffect, useRef } from 'react';
import { useHistory, useNavigate } from 'react-router-dom';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import './App.css';
import alertSound from './lonewolf.mp3' 
import { useSearchParams } from 'react-router-dom';

export function useModal() {
  const [show, setShow] = useState(false);
  
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return { show, handleClose, handleShow }
}

function MatchFound({ show, handleClose, username, gameId }) {

  const { handleShow } = useModal()
  const [timeLeft, setTimeLeft] = useState(30);
  const audioRef = useRef(new Audio(alertSound))
  const [modalBody, setModalBody] = useState('🔲🔲🔲🔲🔲🔲🔲🔲🔲');
  //const [modalBodyAccepted, setModalBodyAccepted] = useState(null);
  const navigate = useNavigate();
  

  useEffect(() => {
    //if(matchAcceptedEventSource && gameId){
      const modalBodyAccepted = new EventSource("/api/matchaccepters")
      console.log("matchaccepted is open")
      modalBodyAccepted.addEventListener('message', (event) => {
      const message = event.data
      if(message === '✅✅✅✅✅✅✅✅✅✅'){
        console.log("everyones ready")
        console.log("using gameid: ", gameId)
        setModalBody('✅✅✅✅✅✅✅✅✅✅')
        fetch("/api/redirecttogame", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          credentials: 'include',
          body: JSON.stringify({
            "username": username,
            "gameId": gameId
          })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log("redirecting :3 :", data)
          if(/REDIRECT GameId:/.test(data)) {
            navigate('/game#'+gameId)
          }
        })
        .catch(error => {  
          console.error("Error accepting match:", error);
        });
        //ADD GAMEID HERE !!, READY TO NAVIGATE NOW
        
        //navigate(`/game#${gameId}`);
      } else {
        setModalBody(message);
      }
    })
    //}
    return () => {
      //handleClose()
      if(modalBodyAccepted){
        console.log("matchaccepted is closed from matchfound.js")
        modalBodyAccepted.close()
      }
    }
  }, [username, gameId, navigate]);

  useEffect(() => {
    let timerId;
    if (show) {
      audioRef.current.play();
      setModalBody('🔲🔲🔲🔲🔲🔲🔲🔲🔲');
      timerId = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            clearInterval(timerId);
            handleClose();
            return 30;
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    return () => {
      if (timerId) clearInterval(timerId);
      audioRef.current.pause()
      audioRef.current.currentTime = 0;
    };
  }, [show, handleClose]);

  function matchAccept() {
    fetch("/api/matchaccepted", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      credentials: 'include',
      body: JSON.stringify({
        "username": username
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("Match accepted successfully:", data);
      document.getElementById("acceptBtn").textContent = "Accepted"
      document.getElementById("acceptBtn").className = "btn-outline-secondary btn disabled"
    })
    .catch(error => {  
      console.error("Error accepting match:", error);
    });

  }

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
          <Modal.Title id="modalTitle">
          Match Found ({timeLeft})
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="modal-body text-center">{modalBody}</Modal.Body>
        <Modal.Footer className="justify-content-center border-top-0">
          <Button id="acceptBtn" variant="success" onClick={(e) => { e.preventDefault(); matchAccept(); }}>Accept</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default MatchFound;