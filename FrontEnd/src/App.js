import logo from './logo.svg';
import './App.css';
import LoginPage from './Login';
import Queue from './Queue';
import Navigationbar from './Navigationbar';
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";

const eventSource = new EventSource('/players');

eventSource.addEventListener('message', (event) => {
  const message = event.data;

  console.log('Received Message: ', message)
});

eventSource.addEventListener('error', (error) => {
  console.error('Error occurred: ', error);
});

function App() {
  return (
    <div className="App">
      <Navigationbar></Navigationbar>
      <header className="App-header">
      </header>
    </div>
  );
}

export default App;
