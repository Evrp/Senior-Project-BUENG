// auth.js
export function requireOwner(req, res, next) {
  // The user object is attached by the authMiddleware
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Not logged in' });
  }

  // Check if the authenticated user's email matches the email in the request params or body
  const requestEmail = req.params.email || req.body.email || req.params.userEmail || req.body.userEmail;
  if (requestEmail && typeof requestEmail === 'string' && req.user.email && typeof req.user.email === 'string') {
    if (requestEmail.trim().toLowerCase() !== req.user.email.trim().toLowerCase()) {
      return res
        .status(403)
        .json({ error: 'Forbidden: You do not have permission to access this resource.' });
    }
  }

  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    // Assuming isAdmin flag is set in the user model
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
}
