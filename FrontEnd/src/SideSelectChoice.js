import React, { useState, useEffect } from 'react';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import "./index.css"

function SideSelectModal({ show, setShow, gameId, team, mapName }) {
  const [timer, setTimer] = useState(15);
  const [sideSelected, setSideSelected] = useState(false)
  const [fetchInProgress, setFetchInProgress] = useState(false)

  function sendSideSelect(side) {
    if (sideSelected || fetchInProgress) return;

    setSideSelected(true);
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
      .then((res) => res.json())
      .then((data) => {
        console.log("side selected successfully", data);
        setShow(false);
      })
      .catch((err) => {
        console.log("error in side select:", err);
        setShow(false);
      })
      .finally(() => {
        setFetchInProgress(false); // Reset fetch in progress
      });
  }

  useEffect(() => {
    if (!show) {
      // Reset timer when modal is hidden
      setTimer(10);
      setSideSelected(false);
      setFetchInProgress(false);
      return;
    }

    if (sideSelected || fetchInProgress) return; // Avoid setting interval if a side is selected or fetch is in progress

    const countdown = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          const Random = Math.floor(Math.random() * 2) + 1
          clearInterval(countdown);
          if (!sideSelected) {
            sendSideSelect(Random);
            setSideSelected(true)
          }
          setShow(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countdown);
    };
  }, [show, sideSelected, fetchInProgress, gameId]);

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
      <Modal.Footer className="border-top-0 justify-content-center bg-dark" style={{ borderRadius: '0 0 5px 5px' }}>
      <Button className="btn-danger btnSideSelect" style={{marginRight:"20px"}} onClick={() => {sendSideSelect(1)}}>Attack</Button>
      <Button className="btn-secondary btnSideSelect" style={{marginLeft:"20px", marginRight:"20px"}} onClick={() => {sendSideSelect(Math.floor(Math.random() * 2)+1)}}>Random</Button>
      <Button className="btn-primary btnSideSelect" style={{marginLeft:"20px"}} onClick={() => {sendSideSelect(2)}}>Defense</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SideSelectModal;