import React from 'react';
import {AbsoluteFill} from 'remotion';
const Scene: React.FC = () => (
  <AbsoluteFill style={{background:'#ff0000',display:'flex',justifyContent:'center',alignItems:'center'}}>
    <h1 style={{color:'#fff',fontSize:72}}>API Test</h1>
  </AbsoluteFill>
);
export {Scene}