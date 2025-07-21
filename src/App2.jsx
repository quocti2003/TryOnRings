// src/App.jsx
// PHIÊN BẢN TỐI GIẢN ĐỂ KIỂM TRA

import React from 'react';
import CustomAxesViewer from './components/jsx/lab/CustomAxesViewer';
import LabContainer from './components/jsx/lab/LabContainer';
import ModelViewer from './components/jsx/lab/ModelViewer';
import BackCamera from './components/jsx/lab/BackCamera';
import Simulate from './components/jsx/lab/Simulate';
import PreprocessingViewer from './components/jsx/lab/PreprocessingViewer';
import './App2.css';

function App() {
    return (
        <div className="App">
            {/* <ModelViewer /> */}

            {/* <Simulate /> */}
            {/* <PreprocessingViewer /> */}
            <BackCamera />
        </div>
    );
}

export default App;