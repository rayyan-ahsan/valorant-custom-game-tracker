import React, { useState, useEffect } from 'react';
import Container from 'react-bootstrap/Container';
import { Link, Navigate, useLocation } from 'react-router-dom';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import './App.css';

function Navigationbar() {
  const [username, setUsername] = useState(null);
  const [inGame, setInGame] = useState(null);
  const location = useLocation();

  useEffect(() => {
    // Check if user is logged in when component mounts
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const response = await fetch('/api/user', {
        method: 'GET',
        credentials: 'include', // important for sending cookies
      });
      if (response.ok) {
        const data = await response.json();
        setUsername(data.username);
        if(data.inGame === 1) {
          setInGame(data.gameId)
        } else {
          setInGame(null)
        }
      }
    } catch (error) {
      console.error('Error checking login status:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        setUsername(null);
        const homepage = window.location.href
        window.location.href = window.location.href.split('?')[0] + '?cache_buster=' + new Date().getTime();
        window.location.href = homepage
      }
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const currentPath = location.pathname + location.hash;

  return (
    <Navbar expand="lg" className="bg-body-tertiary" data-bs-theme="dark">
      <Container>
        <Navbar.Brand><Link to="/" className='navbar-brand'>HLT Queue</Link></Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Item><Link to="/" className='nav-link'>Home</Link></Nav.Item>
            <Nav.Item><Link to="/stats" className='nav-link'>Stats</Link></Nav.Item>
            {inGame && currentPath !== `/game#${inGame}` ? (
              <Nav.Item><Link to={`/game#${inGame}`} className='nav-link'>Lobby</Link></Nav.Item>
            ) : (
              <></>
            )}
          </Nav>
          <Nav>
            {username ? (
              <NavDropdown title={username} id="basic-nav-dropdown">
                <NavDropdown.Item as={Link} to="/profile">Profile</NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={handleLogout}>Logout</NavDropdown.Item>
              </NavDropdown>
            ) : (
              <NavDropdown title="Login / Sign Up" id="basic-nav-dropdown">
                <NavDropdown.Item as={Link} to="/login">Login</NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item as={Link} to="/signup">Sign Up</NavDropdown.Item>
              </NavDropdown>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default Navigationbar;