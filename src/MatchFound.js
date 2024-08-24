import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import './App.css';

export function useModal() {
  const [show, setShow] = useState(false);
  
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  return { show, handleClose, handleShow }
}

function MatchFound({ show, handleClose }) {

  const { handleShow } = useModal()

return(
  <>
      <Button variant="primary" onClick={handleShow}>
        Launch static backdrop modal
      </Button>

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
          <Modal.Title id="modalTitle">Match Found (30)</Modal.Title>
        </Modal.Header>
        <Modal.Body className="modal-body text-center">🔲🔲🔲🔲🔲🔲🔲🔲🔲</Modal.Body>
        <Modal.Footer className="justify-content-center border-top-0">
          <Button variant="success" onClick={handleClose}>Accept</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default MatchFound;