import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Home from './components/Home';
import Creator from './components/Creator';
import AboutUs from './components/AboutUs';
import Blogs from './components/Blogs';
import Instructions from './components/Instructions';
import './App.css';

function App() {
    return (
        <Router>
            <div className="App">
                {/* Navbar */}
                <nav className="navbar">
                    <div className="logo">
                        <img src="/logo.png" alt="App Logo" className="App-logo" />
                    </div>
                    <ul className="nav-links">
                        <li>
                            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Home</NavLink>
                        </li>
                        <li className="instructions-dropdown">
                            <span>Instructions</span>
                            <div className="dropdown-content">
                                <Instructions />
                            </div>
                        </li>
                        <li>
                            <NavLink to="/creator" className={({ isActive }) => isActive ? 'active' : ''}>Creator</NavLink>
                        </li>
                        <li>
                            <NavLink to="/about-us" className={({ isActive }) => isActive ? 'active' : ''}>About Us</NavLink>
                        </li>
                        <li>
                            <NavLink to="/blogs" className={({ isActive }) => isActive ? 'active' : ''}>Blogs</NavLink>
                        </li>
                    </ul>
                </nav>

                {/* Routes */}
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/creator" element={<Creator />} />
                    <Route path="/about-us" element={<AboutUs />} />
                    <Route path="/blogs" element={<Blogs />} />
                    {/* Add more routes as needed */}
                </Routes>
            </div>
        </Router>
    );
}

export default App;
