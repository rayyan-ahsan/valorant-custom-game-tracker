import React, { useState, useEffect } from 'react';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import "./index.css"
import "./Coin.css"

function CoinFlip() {
  const [animationClass, setAnimationClass] = useState('');

  const flipCoin = () => {
    // Randomly choose between the two animations
    const randomSide = Math.random() < 0.5 ? 'animation900' : 'animation1080';

    // Reset animation by removing and adding the class
    setAnimationClass(''); // Remove the class to trigger reflow
    void document.getElementById('coin').offsetWidth; // Force reflow
    setAnimationClass(randomSide); // Set the new animation class
  };

  return (
    <div>
      <div id="coin-flip-cont">
        <div id="coin" className={`coinflip-coin ${animationClass}`}>
          <div className="front" style={{ backgroundImage: 'url(https://images2.imgbox.com/62/7a/vQjyUah4_o.png)' }}></div>
          <div className="back" style={{ backgroundImage: 'url(https://images2.imgbox.com/4f/0d/PdzptbUW_o.png)' }}></div>
        </div>
      </div>
      <button onClick={flipCoin}>Flip Coin</button>
    </div>
  );
};

export default CoinFlip;