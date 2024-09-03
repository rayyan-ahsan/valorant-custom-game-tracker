import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { Container, Row, Col, Form, Button, Alert, Modal, Card } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { Edit2, User, CheckCircle } from 'lucide-react';
import "./Profile.css"

const checkLoginStatus = async (setUsername, setInQueue, setInGame, navigate) => {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      credentials: 'include', // important for sending cookies
    });
    if (response.ok) {
      const data = await response.json();
      if (data.username) {
        setUsername(data.username);
        setInQueue(data.inQueue);
        setInGame(data.inGame);
      } else {
        navigate('/login'); // Redirect to login if no username
      }
    } else {
      navigate('/login'); // Redirect to login if response is not ok
    }
  } catch (error) {
    console.error('Error checking login status:', error);
    navigate('/login'); // Redirect to login on error
  }
};

const updateUsername = async (newUsername) => {
  try {
    const response = await fetch('/api/update-username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // important for sending cookies
      body: JSON.stringify({ username: newUsername }),
    });

    if (response.ok) {
      return await response.json();
    } else {
      const errorText = await response.text();
      throw new Error(errorText);
    }
  } catch (error) {
    console.error('Error updating username:', error);
    throw error;
  }
};

const ProfilePage = () => {
  const [username, setUsername] = useState('');
  const [inQueue, setInQueue] = useState(false);
  const [inGame, setInGame] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    checkLoginStatus(setUsername, setInQueue, setInGame, navigate);
  }, [navigate]);

  const validationSchema = yup.object({
    newUsername: yup
      .string()
      .required('Username is required')
      .min(3, 'Username must be at least 3 characters long')
      .max(20, 'Username must be at most 20 characters long')
      .matches(/^[a-zA-Z0-9_]*$/, 'Username can only contain letters, numbers, and underscores'),
  });

  const formik = useFormik({
    initialValues: { newUsername: username },
    validationSchema: validationSchema,
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      if (confirmSubmit) {
        try {
          if (inQueue || inGame) {
            setError('You cannot change your username while you are in a queue or in-game.');
            return;
          }

          const result = await updateUsername(values.newUsername);
          setSuccess(result.message);
          setError(null);
          setIsEditing(false);
          setUsername(values.newUsername);
        } catch (err) {
          setError(err.message);
          setSuccess(null);
        } finally {
          setSubmitting(false);
        }
      }
    },
  });

  const handleConfirm = () => {
    setConfirmSubmit(true);
    formik.handleSubmit();
    setShowModal(false);
  };

  const isUsernameChanged = formik.values.newUsername !== username;

  return (
    <div className="d-flex align-items-center text-light" style={{ backgroundColor: "rgb(40 44 52)", minHeight: "80dvh" }}>
      <Container className=''>
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <Card className="bg-secondary text-light shadow">
              <Card.Body>
                <div className="text-center mb-4">
                  <User size={64} className="text-light" />
                  <h2 className="mt-3">Profile Page</h2>
                </div>

                {error && <Alert variant="danger">{error}</Alert>}
                {success && <Alert variant="success">{success}</Alert>}

                <Form onSubmit={(e) => {
                  e.preventDefault();
                  if (isEditing) {
                    setShowModal(true);
                  }
                }}>
                  <Form.Group controlId="formBasicUsername" className="mb-4">
                    <Form.Label>Username</Form.Label>
                    <div className="d-flex align-items-center">
                      <Form.Control
                        type="text"
                        placeholder="Enter new username"
                        {...formik.getFieldProps('newUsername')}
                        isInvalid={!!formik.errors.newUsername && formik.touched.newUsername}
                        disabled={!isEditing}
                        className="me-2 bg-dark text-light"
                      />
                      <Button 
                        variant={isEditing ? "outline-light" : "outline-light"}
                        onClick={() => setIsEditing(!isEditing)}
                        className="d-flex align-items-center"
                      >
                        {isEditing ? 'Cancel' : <Edit2 size={18} />}
                      </Button>
                    </div>
                    <Form.Control.Feedback type="invalid">
                      {formik.errors.newUsername}
                    </Form.Control.Feedback>
                  </Form.Group>

                  {isEditing && (
                    <Button 
                      variant="light" 
                      type="submit" 
                      disabled={formik.isSubmitting || !isUsernameChanged}
                      className="w-100 text-dark"
                    >
                      Change Username
                    </Button>
                  )}
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <div data-bs-theme="dark">
        <Modal.Header closeButton className="bgd text-light" style={{borderBottom: "0"}}>
          <Modal.Title>Confirm Change</Modal.Title>
        </Modal.Header>
        </div>
        <Modal.Body className="bgd text-light" style={{borderBottom: "0"}}>
          Are you sure you want to change your username to "{formik.values.newUsername}"?
        </Modal.Body>
        <Modal.Footer className="bgd text-light" style={{borderTop: "0"}}>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            Confirm
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default ProfilePage;