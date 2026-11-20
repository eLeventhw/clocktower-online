import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// 风格正本 → 既有的布局几何 → 六层契约覆盖。顺序不可调：theme 要压过 styles 的
// 同特异性声明，tokens 要先于两者把 --nc-* 挂到 html.ds-nocturne 上。
import './tokens.nocturne.css';
import './styles.css';
import './theme.nocturne.css';
// The static splash in index.html covers the cold-load gap; drop it explicitly rather than
// relying on createRoot to clear the container, which is not part of React's contract.
document.getElementById('boot')?.remove();
createRoot(document.getElementById('root')!).render(<App />);
