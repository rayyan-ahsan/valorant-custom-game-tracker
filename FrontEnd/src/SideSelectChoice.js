import React, { useState, useEffect, useRef } from 'react';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import "./index.css"

function SideSelectModal({ show, setShow, gameId, team, mapName }) {
  const [timer, setTimer] = useState(15);
  const [sideSelected, setSideSelected] = useState(false)
  const [fetchInProgress, setFetchInProgress] = useState(false)
  const [error, setError] = useState('');
  const submitting = useRef(false);

  function sendSideSelect(side) {
    if (sideSelected || submitting.current) return;

    submitting.current = true;
    setError('');
    setFetchInProgress(true);

    console.log("Selecting side:", side);

    fetch(`/api/sendsideselect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: 'include',
      body: JSON.stringify({
        gameId: gameId,
        team: team,
        side: side,
        mapName: mapName,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Side selection failed');
        return res.json();
      })
      .then((data) => {
        console.log("side selected successfully", data);
        setSideSelected(true);
        setShow(false);
      })
      .catch((err) => {
        console.log("error in side select:", err);
        setError('Could not select your side. Please try again.');
      })
      .finally(() => {
        setFetchInProgress(false); // Reset fetch in progress
        submitting.current = false;
      });
  }

  useEffect(() => {
    if (!show) {
      // Reset timer when modal is hidden
      setTimer(15);
      setSideSelected(false);
      setFetchInProgress(false);
      return;
    }

    if (sideSelected || fetchInProgress || error) return;

    const countdown = setInterval(() => {
      setTimer((prev) => {
        return Math.max(0, prev - 1);
      });
    }, 1000);

    return () => {
      clearInterval(countdown);
    };
  }, [show, sideSelected, fetchInProgress, gameId, error]);

  useEffect(() => {
    if (show && timer === 0 && !sideSelected && !fetchInProgress && !error) {
      sendSideSelect(Math.floor(Math.random() * 2) + 1);
    }
  }, [show, timer, sideSelected, fetchInProgress, error]);

  useEffect(() => {
    setTimer(15); setSideSelected(false); setError('');
  }, [mapName]);

  return (
    <Modal show={show} onHide={() => setShow(false)} centered size="md" style={{ border: 'none' }} backdrop="static">
      <Modal.Header style={{ backgroundColor: '#6f42c1', borderRadius: '5px 5px 0 0' }} className="text-white border-bottom-0">
        <Modal.Title className="d-flex align-items-center">
          What side would you like for {mapName}?
        </Modal.Title>
        <span className="ms-auto text-white modal-title h4" style={{ fontSize: '1.2rem' }}>
          {`(${timer})`}
        </span>
      </Modal.Header>
      {error && <div role="alert" className="alert alert-danger">{error}</div>}
      <Modal.Footer className="border-top-0 justify-content-center bg-dark" style={{ borderRadius: '0 0 5px 5px' }}>
      <Button className="btn-danger btnSideSelect" style={{marginRight:"20px"}} onClick={() => {sendSideSelect(1)}}>Attack</Button>
      <Button className="btn-secondary btnSideSelect" style={{marginLeft:"20px", marginRight:"20px"}} onClick={() => {sendSideSelect(Math.floor(Math.random() * 2)+1)}}>Random</Button>
      <Button className="btn-primary btnSideSelect" style={{marginLeft:"20px"}} onClick={() => {sendSideSelect(2)}}>Defense</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SideSelectModal;
