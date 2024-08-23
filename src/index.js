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
    element: <div className="App">
    <Navigationbar/>
    <header className="App-header">
      <LoginPage/>
    </header>
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
