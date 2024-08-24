import { useState, useEffect } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import './App.css';
import MatchFound from './MatchFound';
import { useModal } from './MatchFound';

const eventSource = new EventSource('/queuenumbers');

eventSource.addEventListener('message', (event) => {
  const message = event.data;

  document.getElementById("pplInQueue").textContent = message
  console.log('Received Message: ', message)
});

eventSource.addEventListener('error', (error) => {
  console.error('Error occurred: ', error);
});

function Queue() {

  const { show, handleClose, handleShow } = useModal();

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
    fetch("/queue", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        "username": "MistaDong",
        "inQueue": "1"
      })
    })
    .then((res) => res.json())
    .then((data) => {
      console.log(data);
    })
    .catch((err) => {
      console.log(err.message);
    })
  
    const inQueueEventSource = new EventSource('/api/inqueue');

    inQueueEventSource.addEventListener('message', (event) => {
      const message = event.data;
      if(message === "MATCH FOUND"){
        handleShow()
        var timeLeft = 30;
        var elem = document.getElementById("fakeModalTitle");
        var timerId = setInterval(countdown, 1000)
        function countdown(){
          if(timeLeft == -1){
            clearTimeout(timerId)
            handleClose()
          } else {
            elem.innerHTML = "Match Found (" + timeLeft + ")"
            timeLeft--;
          }
    }
        clearInterval(x)
        button.className = "btn btn-success btn-lg btn-change"
        button.textContent = "Join Queue"
      }
      console.log('Received Message: ', message)
    });
  
    inQueueEventSource.addEventListener('error', (error) => {
      console.error('Error occurred: ', error);
    });
  }

  return (
    <div class="d-grid gap-2 col-3 mx-auto" className="QueueButtonDiv">
        <button id="queueBtn" type="button" class="btn btn-success btn-lg btn-change" onClick={click}>Join Queue</button>
        <p class="text-center" id="pplInQueue">0 people in queue</p>
        <div id="fakeModalTitle" style={{"display":"none"}}></div>
        <MatchFound show={show} handleClose={handleClose} />
    </div>
  );
}

export default Queue;