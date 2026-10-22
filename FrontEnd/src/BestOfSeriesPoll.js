import React, { useState, useEffect, useRef, useCallback } from 'react';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import "./index.css";
import "./App.css";

async function sendVote(vote, gameId) {
  const response = await fetch(`/api/sendbovote?gameId=${gameId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify(vote),
  });
  if (!response.ok) throw new Error('Could not submit your vote. Please try again.');
}

function BOPollVote({ show, handleClose, votes, hasVoted, setHasVoted, handleSubmitVote, gameId, setFinalResult }) {
  const [selectedVote, setSelectedVote] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(Boolean(hasVoted));
  const [timer, setTimer] = useState(15);
  const [isPollClosed, setIsPollClosed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const finalizing = useRef(false);
  const opened = useRef(false);

  useEffect(() => { setHasSubmitted(Boolean(hasVoted)); }, [hasVoted]);

  const handleSubmit = async () => {
    if (!selectedVote || hasSubmitted || submitting.current) return;
    submitting.current = true;
    setError('');
    try {
      await sendVote(selectedVote, gameId);
      handleSubmitVote(selectedVote);
      setHasSubmitted(true);
      setHasVoted(true);
    } catch (e) { setError(e.message); }
    finally { submitting.current = false; }
  };

  const finalize = useCallback(async () => {
    if (finalizing.current) return;
    finalizing.current = true;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/finalseriesvote?gameId=${gameId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not retrieve the match format. Retry below.');
      setFinalResult(await response.json());
      setIsPollClosed(true);
      handleClose();
    } catch (e) { setError(e.message); }
    finally { setIsLoading(false); }
  }, [gameId, handleClose, setFinalResult]);

  useEffect(() => {
    if (!show) { opened.current = false; return; }
    if (!opened.current) {
      opened.current = true;
      setTimer(15);
      setIsPollClosed(false);
      finalizing.current = false;
    }
    const countdown = setInterval(() => setTimer(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(countdown);
  }, [show]);

  useEffect(() => {
    const count = votes.bo1 + votes.bo2 + votes.bo3;
    // Keep the poll available to all ten people, then use the server result.
    // Fetching outside a state updater also avoids duplicate StrictMode effects.
    if (show && !isPollClosed && (count >= 10 || timer === 0)) void finalize();
  }, [show, isPollClosed, votes, timer, finalize]);

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
        {error && <div role="alert">{error}</div>}
        {error && finalizing.current && <Button onClick={() => { finalizing.current = false; void finalize(); }}>Retry result</Button>}
        <div className="vote-options" id="progressBarContainer">
          <div data-testid="vote-bo1" onClick={() => handleVoteClick('bo1')} className="mb-3 position-relative progressBar">
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
          <div data-testid="vote-bo2" onClick={() => handleVoteClick('bo2')} className="mb-3 position-relative progressBar">
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
          <div data-testid="vote-bo3" onClick={() => handleVoteClick('bo3')} className="position-relative progressBar">
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
