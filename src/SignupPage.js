import logo from './logo.svg';
import './App.css';
import './Login.css'
import { useState } from 'react';
import InputGroup from 'react-bootstrap/InputGroup';
import * as formik from 'formik';
import * as yup from 'yup';
import { useNavigate } from 'react-router-dom';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

async function submitSignup(data, navigate) {
  try {
    const response = await fetch('/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const res = await response.json();
    navigate('/login')

    // Handle successful response
    console.log('User created successfully:', res);
    // Redirect or show a success message
    // Example: history.push('/login'); // if using react-router for navigation
  } catch (error) {
    console.error('There was a problem with the fetch operation:', error);
    // Handle error response
    // Example: show an error message to the user
  }
}

function SignupPage() {

  const { Formik } = formik;
  const navigate = useNavigate();

  const schema = yup.object().shape({
    username: yup.string().required().min(3, 'Username needs at least 3 characters').max(30, 'Username is too long'),
    password: yup.string().required().min(5, 'Password too short'),
    passwordConfirmation: yup.string().oneOf([yup.ref('password'), null], 'Passwords must match'),
  });

  return (
    <div className="Login-form">
<Formik
      validationSchema={schema}
      onSubmit={(values) => submitSignup(values, navigate)}
      initialValues={{
        username: '',
      }}
    >
    {({handleSubmit, handleChange, values, errors }) => (
      <Form noValidate onSubmit={handleSubmit}>
        <Form.Group className="mb-3" controlId="formUsername">
          <Form.Label>Username</Form.Label>
          <InputGroup hasValidation>
          <Form.Control
          style={{"width":"max(150px, min(350px ,100%))"}}
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
          style={{"width":"max(150px, min(350px ,100%))"}}
          type="password"
          placeholder="Create Password"
          name="password"
          onChange={handleChange}
          value={values.password}
          isInvalid={!!errors.password}
          />
          <Form.Control.Feedback type="invalid">{errors.password}</Form.Control.Feedback>
          </InputGroup>
        </Form.Group>
        <Form.Group className="mb-3" controlId="formPasswordConfirmation">
          <InputGroup hasValidation>
          <Form.Control
          style={{"width":"max(150px, min(350px ,100%))"}}
          type="password"
          placeholder="Confirm Password"
          name="passwordConfirmation"
          onChange={handleChange}
          value={values.passwordConfirmation}
          isInvalid={!!errors.passwordConfirmation}
          />
          <Form.Control.Feedback type="invalid">{errors.passwordConfirmation}</Form.Control.Feedback>
          </InputGroup>
        </Form.Group>
        <Button variant="primary" type="submit" style={{"width":"max(78px, min(85px, 20%))"}}>
          Sign Up
        </Button>
      </Form>
    )}
    </Formik>
    </div>
  )
  /*
  return (
    <div className="Login-form">
    <Form noValidate validated={validated} className='Vertical-center' onSubmit={handleLogin}>
      <Form.Group className="mb-3" controlId="formBasicEmail">
        <Form.Label>Username</Form.Label>
        <Form.Control type="text" placeholder="MistaDong" style={{"width":"max(150px, min(350px ,100%))"}} required/>
      </Form.Group>
      <Form.Group className="mb-3" controlId="formBasicCheckbox">
        <Form.Check type="checkbox" label="Remember me?"/>
      </Form.Group>
      <Button variant="primary" type="submit" style={{"width":"max(78px, min(85px, 20%))"}}>
        Login
      </Button>
    </Form>
    </div>
  );
  */
};

/*
function LoginPage() {
  return (
    <Form style={{"display": "flex", "flex-wrap": "nowrap", "flex-direction": "column", "width": "30%"}}>
      <Form.Group className="mb-3" controlId="formBasicEmail" style={{"text-align":"left"}}>
        <Form.Label>Username</Form.Label>
        <Form.Control type="text" placeholder="MistaDong" />
      </Form.Group>
      <Form.Group className="mb-3" controlId="formBasicCheckbox" style={{"text-align":"left", "font-size":"calc(8px + 1vmin)"}}>
        <Form.Check type="checkbox" label="Remember me?" style={{"font-size":"calc(8px + 1vmin)"}}/>
      </Form.Group>
      <Button variant="primary" type="submit" style={{"width":"30%"}}>
        Submit
      </Button>
    </Form>
  );
}
*/

export default SignupPage;
