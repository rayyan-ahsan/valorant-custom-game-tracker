import logo from './logo.svg';
import './App.css';
import './Login.css'
import { useState } from 'react';
import * as formik from 'formik';
import * as yup from 'yup';
import { InputGroup, Button, Alert, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom'

async function submitLogin(values, navigate, setError) {
  try {
    const response = await fetch('/login-submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();

    // Handle successful response
    console.log('Login successful:', data);
    navigate('/')

    // Example: Redirect to another page or show a success message
    // Example: history.push('/dashboard'); // If using react-router for navigation
  } catch (error) {
    console.error('There was a problem with the login:', error);
    setError('Invalid username or password. Please try again.');
  }
}

function LoginPage() {

  const { Formik } = formik;
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  const schema = yup.object().shape({
    username: yup.string().required(),
    password: yup.string().required(),
    rememberMe: yup.bool(),
  });

  return (
    <div className="Login-form">
      <div className="Alert-placeholder">
        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}
      </div>
      <Formik
        validationSchema={schema}
        onSubmit={(values) => submitLogin(values, navigate, setError)}
        initialValues={{
          username: '',
          password: '',
          rememberMe: false,
        }}
      >
        {({ handleSubmit, handleChange, values, errors }) => (
          <Form noValidate onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="formUsername">
              <Form.Label>Username</Form.Label>
              <InputGroup hasValidation>
                <Form.Control
                  style={{ width: "max(150px, min(350px ,100%))" }}
                  type="text"
                  placeholder="MistaDong"
                  name="username"
                  onChange={handleChange}
                  value={values.username}
                  isInvalid={!!errors.username}
                />
                <Form.Control.Feedback type="invalid">{errors.username}</Form.Control.Feedback>
              </InputGroup>
            </Form.Group>
            <Form.Group className="mb-3" controlId="formPassword">
              <Form.Label>Password</Form.Label>
              <InputGroup hasValidation>
                <Form.Control
                  style={{ width: "max(150px, min(350px ,100%))" }}
                  type="password"
                  placeholder="Enter Password"
                  name="password"
                  onChange={handleChange}
                  value={values.password}
                  isInvalid={!!errors.password}
                />
                <Form.Control.Feedback type="invalid">{errors.password}</Form.Control.Feedback>
              </InputGroup>
            </Form.Group>
            <Form.Group className="mb-3" controlId="formRememberMe">
              <Form.Check
                type="checkbox"
                label="Remember me?"
                name="rememberMe"
                onChange={handleChange}
                checked={values.rememberMe}
              />
            </Form.Group>
            <Button variant="primary" type="submit" style={{ width: "max(78px, min(85px, 20%))" }}>
              Login
            </Button>
          </Form>
        )}
      </Formik>
    </div>
  );
}

export default LoginPage;