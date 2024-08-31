import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
// Bootstrap CSS
import "bootstrap/dist/css/bootstrap.min.css";
// Bootstrap Bundle JS
import "bootstrap/dist/js/bootstrap.bundle.min";
import LoginPage from './LoginPage';
import Queue from './Queue';
import Navigationbar from './Navigationbar';
import GamePage from './GamePage';
import SignupPage from './SignupPage';
import BOPollVote from './BestOfSeriesPoll';
import SideSelectModal from './SideSelectChoice';
import CoinFlip from './CoinFlipPage';

const router = createBrowserRouter([
  {
    path: "/",
    element: <div className="App">
    <Navigationbar/>
    <header className="App-header">
      <Queue/>
    </header>
    </div>,
  },
  {
    path: "/login",
    element:
    <div>
    <div className="App">
    <Navigationbar/>
    </div>
    <div className="Login-form-bg">
        <LoginPage/>
    </div>
    </div>
  },
  {
    path: "/game",
    element:
    <div>
    <div className="App">
    <Navigationbar/>
    </div>
    <div className="Login-form-bg">
        <GamePage/>
    </div>
    </div>
  },
  {
    path: "/signup",
    element:
    <div>
    <div className="App">
    <Navigationbar/>
    </div>
    <div className="Login-form-bg">
        <SignupPage/>
    </div>
    </div>
  },
  {
    path: "/stats",
    element:
    <div>
    <div className="App">
    <Navigationbar/>
    </div>
    <div className="Login-form-bg">
        <div style={{padding: "10px"}}>Work in progress sorry :3</div>
    </div>
    </div>
  },
  {
    path: "/testcoinflip",
    element:
    <div>
    <div className="App">
    <Navigationbar/>
    </div>
    <div className="Login-form-bg">
        <CoinFlip></CoinFlip>
    </div>
    </div>
  },
]);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
