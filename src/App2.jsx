// src/App.jsx
// PHIÊN BẢN TỐI GIẢN ĐỂ KIỂM TRA

import React, { useState } from 'react';
import CustomAxesViewer from './components/jsx/lab/CustomAxesViewer';
import LabContainer from './components/jsx/lab/LabContainer';
import ModelViewer from './components/jsx/lab/ModelViewer';
import ModelViewer2 from './components/jsx/lab/ModelViewer2';
import ModelViewer3 from './components/jsx/lab/ModelViewer3';

import Simulate from './components/jsx/lab/Simulate';
import PreprocessingViewer from './components/jsx/lab/PreprocessingViewer';
import BackCamera from './components/jsx/lab/BackCamera';

import AR1 from './components/jsx/lab/AR1';
import AR2 from './components/jsx/lab/AR2';
import Refined from './components/jsx/lab/Refined';


import './App2.css';

function App() {
    return (
        <div className="App">
            {/* <Simulate /> */}
            {/* <ModelViewer1 /> */}
            {/* <ModelViewer2 /> */}
            {/* <ModelViewer3 /> */}

            {/* <PreprocessingViewer /> */}

            {/* {<BackCamera />} */}
            {/* <AR1 /> */}
            {/* <AR2 /> */}
            <Refined />
            {/* <RingViewer /> */}


        </div>
    );
}

export default App;