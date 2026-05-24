import { useState, useEffect } from 'react';
import { auth, provider, signInWithPopup } from '../firebase/firebase';
import { useAuth } from '../context/AuthContextProvider';
import { useNavigate } from 'react-router-dom';
import './auth.css';

const NewLogin = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const { user, loginWithEmail, registerWithEmail, resetPassword } = useAuth();

  // Form states สำหรับ Email/Password
  const [signInForm, setSignInForm] = useState({
    email: '',
    password: '',
  });

  const [signUpForm, setSignUpForm] = useState({
    name: '',
    email: '',
    password: '',
    photo: null,
  });

  const [photoPreview, setPhotoPreview] = useState(null);

  // Enhanced animation handling
  useEffect(() => {
    const container = document.getElementById('container');
    const registerButton = document.getElementById('register');
    const loginButton = document.getElementById('login');

    const handleRegisterClick = () => {
      setIsActive(true);
      setError(''); // Clear errors when switching
      container?.classList.add('active');
    };

    const handleLoginClick = () => {
      setIsActive(false);
      setError(''); // Clear errors when switching
      container?.classList.remove('active');
    };

    if (registerButton && loginButton && container) {
      registerButton.addEventListener('click', handleRegisterClick);
      loginButton.addEventListener('click', handleLoginClick);
    }

    // Entrance animation
    const timer = setTimeout(() => {
      container?.classList.add('entrance-complete');
    }, 100);

    return () => {
      clearTimeout(timer);
      if (registerButton && loginButton) {
        registerButton.removeEventListener('click', handleRegisterClick);
        loginButton.removeEventListener('click', handleLoginClick);
      }
    };
  }, []);

  // Check if mobile using useState and resize listener
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Handle Photo Selection
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('ขนาดรูปภาพต้องไม่เกิน 5MB');
        return;
      }

      setSignUpForm({ ...signUpForm, photo: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
      setError('');
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Enhanced form validation
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.endsWith('@bumail.net');
  };

  const validatePassword = (password) => {
    return password.length >= 6;
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if the email is from @bumail.net
      if (!user.email.endsWith('@bumail.net')) {
        setError('โปรดใช้บัญชี @bumail.net เท่านั้น');
        await auth.signOut(); // Sign out the user
        setIsLoading(false);
        return; // Stop the function
      }

      //////เก็บข้อมูล User ใน localStorage//////
      localStorage.setItem('userName', user.displayName || user.email.split('@')[0]);
      localStorage.setItem('userPhoto', user.photoURL || '');
      localStorage.setItem('userEmail', user.email);

      // Success animation (navigation handled by useEffect watching user state)
      const container = document.getElementById('container');
      container?.classList.add('success-animation');

      // Smooth transition to home
      setTimeout(() => {
        navigate('/home');
      }, 500);
    } catch (error) {
      setError('เกิดข้อผิดพลาดในการล็อกอิน');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced Email/Password Sign In with validation
  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Real-time validation
    if (!validateEmail(signInForm.email)) {
      setError('กรุณาใช้อีเมล @bumail.net ที่ถูกต้อง');
      setIsLoading(false);
      return;
    }

    if (!validatePassword(signInForm.password)) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      setIsLoading(false);
      return;
    }

    try {
      const user = await loginWithEmail(signInForm.email, signInForm.password);
      // Success animation (navigation handled by useEffect watching user state)
      const container = document.getElementById('container');
      container?.classList.add('success-animation');

      // เก็บข้อมูลลง localStorage
      localStorage.setItem('userName', user.displayName || signInForm.email.split('@')[0]);
      localStorage.setItem('userPhoto', user.photoURL || '');
      localStorage.setItem('userEmail', user.email);
      if (user.email.endsWith('@bumail.net')) {
        navigate('/home');
      } else {
        setError('กรุณาใช้อีเมล @bumail.net');
      }
    } catch (error) {
      console.error('Email sign in error:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced Email/Password Sign Up with validation
  const handleEmailSignUp = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Real-time validation
    if (!signUpForm.name.trim()) {
      setError('กรุณากรอกชื่อของคุณ');
      setIsLoading(false);
      return;
    }

    if (!validateEmail(signUpForm.email)) {
      setError('กรุณาใช้อีเมล @bumail.net ที่ถูกต้อง');
      setIsLoading(false);
      return;
    }

    if (!validatePassword(signUpForm.password)) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      setIsLoading(false);
      return;
    }

    if (!signUpForm.photo) {
      setError('กรุณาอัปโหลดรูปภาพโปรไฟล์');
      setIsLoading(false);
      return;
    }

    try {
      await registerWithEmail(
        signUpForm.email,
        signUpForm.password,
        signUpForm.name,
        signUpForm.photo
      );

      // บันทึกลง localStorage (เอาออกเพราะยังไม่ได้ยืนยัน)
      // localStorage.setItem("userName", user.displayName);
      // localStorage.setItem("userPhoto", user.photoURL || "");
      // localStorage.setItem("userEmail", user.email);

      // แสดงข้อความแจ้งเตือน
      setIsActive(false); // สลับกลับไปหน้า Login
      const container = document.getElementById('container');
      container?.classList.remove('active');

      setSignInForm({ ...signInForm, email: signUpForm.email });
      setResetMessage('ลงทะเบียนสำเร็จ! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันตัวตนก่อนเข้าสู่ระบบ');
      setShowResetModal(false);

      // เลื่อนไปแสดง Error หรือ Message (ถ้ามี)
      window.scrollTo(0, 0);
    } catch (error) {
      console.error('Email sign up error:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password reset
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setIsLoading(true);

    try {
      if (!resetEmail) {
        throw new Error('กรุณากรอกอีเมล');
      }

      await resetPassword(resetEmail);
      setResetMessage('ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบอีเมล');
      setResetEmail('');
      setTimeout(() => {
        setShowResetModal(false);
        setResetMessage('');
      }, 3000);
    } catch (error) {
      setError(error.message);
    }

    setIsLoading(false);
  };

  // Real-time input validation
  const handleEmailChange = (e, formType) => {
    const email = e.target.value;
    if (formType === 'signIn') {
      setSignInForm({ ...signInForm, email });
    } else {
      setSignUpForm({ ...signUpForm, email });
    }

    // Clear error if email becomes valid
    if (validateEmail(email) || email === '') {
      setError('');
    }
  };

  return (
    <div className="page-wrapper">
      <div className={`container ${isLoading ? 'loading' : ''}`} id="container">
        {/* Sign In Form */}
        <div className="form-container sign-in">
          <form onSubmit={handleEmailSignIn}>
            <h1>ยินดีต้อนรับกลับ</h1>
            <div className="social-icons" onClick={handleGoogleSignIn}>
              <a
                href="#"
                className="icon"
                // onClick={handleGoogleSignIn}
                aria-label="Sign in with Google"
              >
                <i className="fa-brands fa-google"></i>
              </a>
              <p className="text-google">เชื่อมต่อด้วย Google</p>
            </div>
            {/* <span>หรือใช้อีเมล @bumail.net ของคุณ</span> */}

            <input
              type="email"
              placeholder="yourname@bumail.net"
              value={signInForm.email}
              onChange={(e) => handleEmailChange(e, 'signIn')}
              required
              disabled={isLoading}
              autoComplete="email"
            />

            <input
              type="password"
              placeholder="รหัสผ่าน"
              value={signInForm.password}
              onChange={(e) => setSignInForm({ ...signInForm, password: e.target.value })}
              required
              disabled={isLoading}
              autoComplete="current-password"
            />

            <button
              type="button"
              className="forgot-password-link"
              onClick={() => setShowResetModal(true)}
            >
              ลืมรหัสผ่าน?
            </button>

            <button type="submit" disabled={isLoading} aria-label="Sign in to your account">
              {isLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>

            {/* Link to signup */}
            <div className="signup-link">
              <span>ยังไม่มีบัญชี? </span>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setIsActive(true);
                  const container = document.getElementById('container');
                  container?.classList.add('active');
                  setError('');
                }}
              >
                สมัครสมาชิกที่นี่
              </button>
            </div>

            {resetMessage && (
              <div className="success-message">
                <div className="success-icon-wrapper">
                  <i className="fas fa-paper-plane"></i>
                </div>
                <div className="success-text-wrapper">
                  {resetMessage}
                </div>
              </div>
            )}

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Sign Up Form */}
        <div className="form-container sign-up">
          <form onSubmit={handleEmailSignUp}>
            <h1>สร้างบัญชีใหม่</h1>

            {/* Photo Upload Section */}
            <div className="photo-upload-container">
              <input
                type="file"
                id="photo-upload"
                accept="image/*"
                onChange={handlePhotoChange}
                style={{ display: 'none' }}
                disabled={isLoading}
              />
              <div
                className="photo-preview-wrapper"
                onClick={() => document.getElementById('photo-upload').click()}
              >
                {photoPreview ? (
                  <>
                    <img src={photoPreview} alt="Preview" className="photo-preview" />
                    <div className="photo-overlay">
                      <i className="fas fa-camera"></i>
                    </div>
                  </>
                ) : (
                  <div className="photo-placeholder">
                    <i className="fas fa-user-circle"></i>
                    <span>เลือกรูปโปรไฟล์</span>
                  </div>
                )}
              </div>
              <p className="photo-label">รูปภาพโปรไฟล์ (จำเป็น)</p>
            </div>

            <input
              type="text"
              placeholder="ชื่อ-นามสกุล"
              value={signUpForm.name}
              onChange={(e) => setSignUpForm({ ...signUpForm, name: e.target.value })}
              required
              disabled={isLoading}
              autoComplete="name"
            />

            <input
              type="email"
              placeholder="yourname@bumail.net"
              value={signUpForm.email}
              onChange={(e) => handleEmailChange(e, 'signUp')}
              required
              disabled={isLoading}
              autoComplete="email"
            />

            <input
              type="password"
              placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)"
              value={signUpForm.password}
              onChange={(e) => setSignUpForm({ ...signUpForm, password: e.target.value })}
              required
              minLength={6}
              disabled={isLoading}
              autoComplete="new-password"
            />

            <button type="submit" disabled={isLoading} aria-label="Create new account">
              {isLoading ? 'กำลังสร้างบัญชี...' : 'สมัครสมาชิก'}
            </button>

            {/* Link to signin */}
            <div className="signup-link">
              <span>มีบัญชีแล้ว? </span>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setIsActive(false);
                  const container = document.getElementById('container');
                  container?.classList.remove('active');
                  setError('');
                }}
              >
                เข้าสู่ระบบที่นี่
              </button>
            </div>

            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Toggle panel */}
        <div className="toggle-container">
          <div className="toggle">
            <div className="toggle-panel toggle-left">
              <h1>ยินดีต้อนรับสู่ FindFriend</h1>
              <p>ใช้อีเมล @bumail.net ของคุณเพื่อเข้าใช้ฟีเจอร์ทั้งหมด</p>
              <button
                className="hidden"
                id="login"
                disabled={isLoading}
                aria-label="Switch to sign in"
                title="👆 กดที่นี่เพื่อกลับไปหน้าเข้าสู่ระบบ"
              >
                🔐 เข้าสู่ระบบ
              </button>
            </div>
            <div className="toggle-panel toggle-right">
              <h1>สวัสดี นักศึกษา BU!</h1>
              <p>สมัครสมาชิกด้วยอีเมล @bumail.net เพื่อเชื่อมต่อกับเพื่อนๆ</p>
              <button
                className="hidden"
                id="register"
                disabled={isLoading}
                aria-label="Switch to sign up"
                title="👆 กดที่นี่เพื่อไปหน้าสมัครสมาชิก"
              >
                📝 สมัครสมาชิก
              </button>
            </div>
          </div>
        </div>

        {/* Reset Password Modal */}
        {showResetModal && (
          <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
            <div className="reset-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>รีเซ็ตรหัสผ่าน</h2>
                <button
                  className="close-btn"
                  onClick={() => setShowResetModal(false)}
                  aria-label="ปิด"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleForgotPassword}>
                <p>กรอกอีเมล @bumail.net ของคุณ เราจะส่งลิงก์รีเซ็ตรหัสผ่านให้คุณ</p>

                <input
                  type="email"
                  placeholder="yourname@bumail.net"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />

                <div className="modal-buttons">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setShowResetModal(false)}
                    disabled={isLoading}
                  >
                    ยกเลิก
                  </button>
                  <button type="submit" className="reset-btn" disabled={isLoading}>
                    {isLoading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ต'}
                  </button>
                </div>

                {error && <div className="error-message">{error}</div>}
                {resetMessage && (
                  <div className="success-message">
                    <div className="success-icon-wrapper">
                      <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="success-text-wrapper">
                      {resetMessage}
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Mobile Toggle Buttons */}
        {isMobile && (
          <div className="mobile-toggle">
            <button
              className={`mobile-btn ${!isActive ? 'active' : ''}`}
              onClick={() => {
                setIsActive(false);
                const container = document.getElementById('container');
                container?.classList.remove('active');
                setError('');
              }}
            >
              เข้าสู่ระบบ
            </button>
            <button
              className={`mobile-btn ${isActive ? 'active' : ''}`}
              onClick={() => {
                setIsActive(true);
                const container = document.getElementById('container');
                container?.classList.add('active');
                setError('');
              }}
            >
              สมัครสมาชิก
            </button>
          </div>
        )}

        {/* Enhanced Floating Action Button - Multiple pathways */}
        <div className="floating-actions">
          {!isActive && (
            <button
              className="floating-btn signup-fab"
              onClick={() => {
                setIsActive(true);
                const container = document.getElementById('container');
                container?.classList.add('active');
                setError('');
              }}
              title="สมัครสมาชิกใหม่"
              aria-label="Switch to signup form"
            >
              <i className="fas fa-user-plus"></i>
              <span>สมัครสมาชิก</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewLogin;
