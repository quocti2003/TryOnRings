// src/App.jsx
// PHIÊN BẢN TỐI GIẢN ĐỂ KIỂM TRA

import React, { useState } from 'react';
import CustomAxesViewer from './components/jsx/lab/CustomAxesViewer';
import LabContainer from './components/jsx/lab/LabContainer';
import ModelViewer from './components/jsx/lab/ModelViewer';
import ModelViewer2 from './components/jsx/lab/ModelViewer2';
import ModelViewer3 from './components/jsx/lab/ModelViewer3';

import Simulate from './components/jsx/lab/Simulate';
import BackCamera from './components/jsx/lab/BackCamera';

import AR1 from './components/jsx/lab/AR1';
import AR2 from './components/jsx/lab/AR2';
import Refined from './components/jsx/lab/Refined';
import Refined2 from './components/jsx/lab/Refined2';
import CameraScene from './components/jsx/deliveredAR/CameraScene';
import CameraScene1 from './components/jsx/deliveredAR/CameraScene1';
import CameraScene2 from './components/jsx/deliveredAR/CameraScene2';
import TryOnRing from './components/jsx/deliveredAR/TryOnRing';


import GlbInspector from './components/jsx/deliveredAR/GlbInspector';
import GlbOptimizer from './components/jsx/deliveredAR/GlbOptimizer';





import './App2.css';

function App() {
    return (
        <div className="App">
            {/* <Simulate /> */}
            {/* <ModelViewer /> */}
            {/* <ModelViewer2 /> */}
            {/* <ModelViewer3 /> */}
            {/* {<BackCamera />} */}
            {/* <AR1 /> */}
            {/* <AR2 /> */}
            {/* <Refined /> */}
            {/* <Refined2 /> */}
            {/* <GlbInspector /> */}
            {/* <GlbOptimizer /> */}
            {/* <CameraScene /> */}
            {/* <CameraScene1 /> */}
            {/* <CameraScene2 /> */}
            <TryOnRing />



        </div>
    );
}

export default App;