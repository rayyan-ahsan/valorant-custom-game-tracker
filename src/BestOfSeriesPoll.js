import React, { useState, useEffect } from 'react';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import "./index.css"
import "./App.css"

function sendVote(vote, gameId) {
  fetch(`/api/sendbovote?gameId=${gameId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify(vote),
  })
  .then((res) => res.json)
  .then((data) => {
    console.log("voted successfully", data)
  })
  .catch((err) => {
    console.log("error in voting:", err)
  })
}

function determineResult(votes) {
  const { bo1, bo2, bo3 } = votes;
  if (bo1 >= bo2 && bo1 >= bo3) return 'bo1';
  if (bo2 > bo1 && bo2 >= bo3) return 'bo2';
  return 'bo3';
}

function BOPollVote({ show, handleClose, votes, setVotes, hasVoted, setHasVoted, handleSubmitVote, gameId, setFinalResult }) {
  const [selectedVote, setSelectedVote] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(hasVoted);
  const [timer, setTimer] = useState(15);
  const [isPollClosed, setIsPollClosed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setHasSubmitted(hasVoted);
  }, [hasVoted]);

  const handleSubmit = () => {
    if (selectedVote && !hasSubmitted) {
      sendVote(selectedVote, gameId)
      handleSubmitVote(selectedVote);
      setHasSubmitted(true);
      setHasVoted(true)
    }
  };

  useEffect(() => {
    if (!show || isPollClosed) return;

    
    const countdown = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(countdown);
          setIsLoading(true)
          const localResult = determineResult(votes)
          console.log("local result atm: ", localResult)
          setFinalResult(localResult)

          fetch(`/api/finalseriesvote?gameId=${gameId}`)
            .then(res => res.json())
            .then(data => {
              console.log("server result: ", data)
              setFinalResult(data); // Update with server result
              setIsLoading(false);
              handleClose();
            })
            .catch(err => {
              console.error("Error fetching final vote:", err);
              setIsLoading(false);
              handleClose();
            });

          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [show, isPollClosed, handleClose, votes, gameId, setFinalResult]);

  useEffect(() => {
    const totalVotes = votes.bo1 + votes.bo2 + votes.bo3;
    if (totalVotes >= 10 || votes.bo1 >= 6 || votes.bo2 >= 6 || votes.bo3 >= 6) {
      setIsPollClosed(true);
      handleClose();
    }
  }, [votes, handleClose]);

  const handleVoteClick = (format) => {
    if (!hasSubmitted) {
      setSelectedVote(format);
    }
  };

  const totalVotes = votes.bo1 + votes.bo2 + votes.bo3;

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" style={{ border: 'none' }} backdrop="static">
      <Modal.Header style={{ backgroundColor: '#6f42c1', borderRadius: '5px 5px 0 0' }} className="text-white border-bottom-0">
        <Modal.Title className="d-flex align-items-center">
          {isLoading ? "Finalizing Results..." : "Vote for Match Format"}
        </Modal.Title>
        <span className="ms-auto text-white modal-title h4" style={{ fontSize: '1.2rem' }}>
          {`(${timer})`}
        </span>
      </Modal.Header>
      <Modal.Body className="text-center py-4 bg-dark text-white" style={{ padding: '20px'}}>
        <div className="vote-options" id="progressBarContainer">
          <div onClick={() => handleVoteClick('bo1')} className="mb-3 position-relative progressBar">
            <ProgressBar 
              now={(votes.bo1 / totalVotes) * 100} 
              label={<span>BO1</span>}
              variant="danger"
              style={{
                height: '40px',
                borderRadius: '5px',
                border: selectedVote === 'bo1' ? '2px solid #ffffff' : 'none',
                fontSize: '1.2rem',
                minWidth: '50px'
              }}
              className="bg-secondary h6"
            />
            <span 
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1.2rem',
                color: '#ffffff',
              }}
              className="h6"
            >
              {votes.bo1}
            </span>
          </div>
          <div onClick={() => handleVoteClick('bo2')} className="mb-3 position-relative progressBar">
            <ProgressBar 
              now={(votes.bo2 / totalVotes) * 100} 
              label={<span>BO2</span>}
              variant="success"
              style={{
                height: '40px',
                borderRadius: '5px',
                border: selectedVote === 'bo2' ? '2px solid #ffffff' : 'none',
                fontSize: '1.2rem',
                minWidth: '50px'
              }}
              className="bg-secondary h6"
            />
            <span 
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1.2rem',
                color: '#ffffff'
              }}
              className='h6'
            >
              {votes.bo2}
            </span>
          </div>
          <div onClick={() => handleVoteClick('bo3')} className="position-relative progressBar">
            <ProgressBar 
              now={(votes.bo3 / totalVotes) * 100} 
              label={<span>BO3</span>}
              variant="primary"
              style={{
                height: '40px',
                borderRadius: '5px',
                border: selectedVote === 'bo3' ? '2px solid #ffffff' : 'none',
                fontSize: '1.2rem',
                minWidth: '50px!important'
              }}
              className="bg-secondary h6"
            />
            <span 
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1.2rem',
                color: '#ffffff'
              }}
              className='h6'
            >
              {votes.bo3}
            </span>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="border-top-0 justify-content-center bg-dark" style={{ borderRadius: '0 0 5px 5px' }}>
      <Button 
          variant={hasSubmitted ? "success" : "outline-light"} 
          onClick={handleSubmit} 
          disabled={hasSubmitted || selectedVote === null}
          className="btn-change2"
        >
          {hasSubmitted ? "Submitted" : "Submit Vote"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default BOPollVote;
