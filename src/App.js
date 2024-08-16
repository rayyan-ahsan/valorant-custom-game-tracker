import logo from './logo.svg';
import './App.css';

function click() {
  const button = document.getElementById("queueBtn")
  button.className = "btn btn-outline-secondary btn-lg disabled"
  button.textContent = "00:00"
  var now = new Date().getTime();
  var x = setInterval(function() {

    // Get today's date and time
    var live = new Date().getTime();
  
    // Find the distance between now and the count down date
    var distance = live - now;
  
    // Time calculations for days, hours, minutes and seconds
    var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
    var seconds = Math.floor((distance % (1000 * 60)) / 1000).toString().padStart(2, '0');
  
    // Display the result in the element with id="demo"
    document.getElementById("queueBtn").textContent = minutes + ":" + seconds + "";
  
    // If the count down is finished, write some text
    if (distance < 0) {
      clearInterval(x);
      document.getElementById("demo").innerHTML = "EXPIRED";
    }
  }, 1000);
  fetch("/queue", {
    method: "POST",
    body: {"inQueue": "yes"},
    headers: {"Content-Type": "application/json"}
  })
}

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <div class="d-grid gap-2 col-3 mx-auto">
        <button id="queueBtn" type="button" class="btn btn-success btn-lg btn-change" onClick={click}>Join Queue</button>
        <p class="text-center">5 people in queue</p>
        </div>
      </header>
    </div>
  );
}

export default App;
