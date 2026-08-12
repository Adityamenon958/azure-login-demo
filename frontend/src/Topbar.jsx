import React, { useState, useEffect, useRef } from 'react';
import { Row, Col, Button, Modal, Dropdown, Form } from 'react-bootstrap';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './Toopbar.module.css';
import Dlogo from '../src/assets/GSN Solutions 2.png';
import { Menu, User, LogOut } from 'lucide-react';
import { generateCompanyInitials } from './lib/userUtils';
import { IoGlobeOutline } from 'react-icons/io5';
import { useTrackerDataSource } from './tracker/context/TrackerDataSourceContext';

export default function Topbar({ toggleSidebar, zoneFilter, onZoneChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [elevatorZones, setElevatorZones] = useState([]);
  const [animateZoneHint, setAnimateZoneHint] = useState(false);
  
  // ✅ Tooltip states
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipText, setTooltipText] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const profileRef = useRef(null);
  const {
    canEdit: canEditDataSource,
    showRealData,
    showDemoData,
    setShowRealData,
    setShowDemoData,
  } = useTrackerDataSource();

  // ✅ Fetch user info when component mounts
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await axios.get('/api/auth/userinfo', { withCredentials: true });
        setUserInfo(res.data);
      } catch (err) {
        console.error("Failed to fetch user info:", err);
      }
    };

    fetchUserInfo();
  }, []);

  const showElevatorZoneFilter = location.pathname === '/dashboard/elevator-overview';

  useEffect(() => {
    if (!showElevatorZoneFilter) return;

    const fetchElevatorZones = async () => {
      try {
        const res = await axios.get('/api/elevator-zones', { withCredentials: true });
        setElevatorZones(res.data || []);
      } catch (err) {
        console.error('Failed to fetch elevator zones in topbar:', err.message);
        setElevatorZones([]);
      }
    };

    fetchElevatorZones();
  }, [showElevatorZoneFilter]);

  useEffect(() => {
    if (!showElevatorZoneFilter) return;

    setAnimateZoneHint(true);
    const timer = setTimeout(() => setAnimateZoneHint(false), 3000);
    return () => clearTimeout(timer);
  }, [showElevatorZoneFilter]);

  // ✅ Handle logout
  const handleLogout = async () => {
    try {
      await axios.post('/api/logout', {}, { withCredentials: true });
      setShowProfileModal(false);
      navigate('/');
    } catch (err) {
      console.error("Logout failed:", err.message);
      navigate('/');
    }
  };

  // ✅ Handle profile navigation
  const handleProfileClick = () => {
    setShowProfileModal(false);
    navigate('/dashboard/settings');
  };

  // ✅ Tooltip handlers
  const handleMouseEnter = (text, ref) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setTooltipPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10
      });
      setTooltipText(text);
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  // ✅ Handle outside click to close modal
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileModal) {
        const modal = document.querySelector(`.${styles.profileModal}`);
        const profilePicture = document.querySelector(`.${styles.profilePicture}`);
        
        if (modal && !modal.contains(event.target) && profilePicture && !profilePicture.contains(event.target)) {
          setShowProfileModal(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileModal]);

  return (
    <>
    <Row className={`${styles.topbar} align-items-center mb-0`}>
      <Col xs="auto" className={styles.leftControlCol}>
        <Button
          className={` me-2 ${styles.burgerButton}`}
          onClick={toggleSidebar}
        >
          <Menu />
        </Button>
        <img src={Dlogo} className={`${styles.Dlogo}`} alt="Logo" />
      </Col>

      {showElevatorZoneFilter && (
        <Col xs="auto" className={styles.zoneControlColLeft}>
          <div className={styles.zoneControlWrap}>
            <Dropdown align="start">
              <Dropdown.Toggle
                as="button"
                className={`${styles.zoneSelectButton} ${animateZoneHint ? styles.zoneAttentionOnce : ''}`}
                aria-label="Filter by zone"
              >
                <IoGlobeOutline className={styles.zoneButtonIcon} />
                {(() => {
                  if (zoneFilter === '__unassigned__') return 'Unassigned only';
                  if (!zoneFilter) return 'All zones';
                  const selected = elevatorZones.find((z) => z._id === zoneFilter);
                  if (!selected) return 'All zones';
                  return userInfo?.role === 'superadmin'
                    ? `${selected.companyName} - ${selected.name}`
                    : selected.name;
                })()}
              </Dropdown.Toggle>
              <Dropdown.Menu className={styles.zoneDropdownMenu}>
                <Dropdown.Item
                  className={styles.zoneDropdownItem}
                  active={zoneFilter === ''}
                  onClick={() => onZoneChange('')}
                >
                  All zones
                </Dropdown.Item>
                <Dropdown.Item
                  className={styles.zoneDropdownItem}
                  active={zoneFilter === '__unassigned__'}
                  onClick={() => onZoneChange('__unassigned__')}
                >
                  Unassigned only
                </Dropdown.Item>
                {elevatorZones.map((z) => (
                  <Dropdown.Item
                    key={z._id}
                    className={styles.zoneDropdownItem}
                    active={zoneFilter === z._id}
                    onClick={() => onZoneChange(z._id)}
                  >
                    {userInfo?.role === 'superadmin' ? `${z.companyName} - ${z.name}` : z.name}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </Col>
      )}

      <Col>
        <h4 className={`mb-0 ps-0 d-flex align-items-center ${styles.DlogoText}`}>
          {/* GSN Edge */}
        </h4>
      </Col>
      
      {/* ✅ Profile Picture Section */}
      <Col xs="auto" className={styles.profileControlCol}>
        <div 
          ref={profileRef}
          className={styles.profilePicture}
          onClick={() => setShowProfileModal(true)}
          onMouseEnter={() => handleMouseEnter("Click to open profile menu", profileRef)}
          onMouseLeave={handleMouseLeave}
        >
          <div className={styles.textAvatar}>
            {generateCompanyInitials(userInfo?.companyName)}
          </div>
        </div>
      </Col>
    </Row>

    {/* ✅ Custom Tooltip */}
    {showTooltip && (
      <div
        className={styles.customTooltip}
        style={{
          left: tooltipPosition.x,
          top: tooltipPosition.y,
          transform: 'translateX(-50%)'
        }}
      >
        {tooltipText}
        <div className={styles.tooltipArrow}></div>
      </div>
    )}

    {/* ✅ Profile Dropdown Modal */}
    <Modal
      show={showProfileModal}
      onHide={() => setShowProfileModal(false)}
      className={styles.profileModal}
      backdrop={false}
      keyboard={true}
    >
      <Modal.Body className={styles.profileModalBody}>
        <div className={styles.profileHeader}>
          <div className={styles.profileImageContainer}>
            <div className={styles.textAvatarLarge}>
              {generateCompanyInitials(userInfo?.companyName)}
            </div>
          </div>
          <div className={styles.profileInfo}>
            <h6 className={styles.userName}>{userInfo?.name || 'User'}</h6>
            <p className={styles.userEmail}>{userInfo?.email || 'user@example.com'}</p>
          </div>
        </div>
        
        {canEditDataSource && (
          <div className={styles.profileDataToggles}>
            <Form.Check
              type="switch"
              id="tracker-show-real-data"
              className={styles.profileDataSwitch}
              label="Real data"
              checked={showRealData}
              onChange={(e) => setShowRealData(e.target.checked)}
            />
            <Form.Check
              type="switch"
              id="tracker-show-demo-data"
              className={styles.profileDataSwitch}
              label="Demo data"
              checked={showDemoData}
              onChange={(e) => setShowDemoData(e.target.checked)}
            />
          </div>
        )}

        <div className={styles.profileActions}>
          <Button 
            variant="link" 
            className={styles.profileAction}
            onClick={handleProfileClick}
          >
            <User size={16} className="me-2" />
            Your Profile
          </Button>
          
          <Button 
            variant="link" 
            className={styles.profileAction}
            onClick={handleLogout}
          >
            <LogOut size={16} className="me-2" />
            Log out
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  </>
  );
}
