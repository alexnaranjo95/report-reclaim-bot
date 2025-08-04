import DOMPurify, { Config } from 'dompurify';

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param content HTML content to sanitize
 * @param options DOMPurify configuration options
 * @returns Sanitized HTML content safe for rendering
 */
export const sanitizeHtml = (content: string, options?: Config): string => {
  const defaultOptions: Config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'i', 'b', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id',
      'style', 'data-*'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'iframe'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  };

  const config = { ...defaultOptions, ...options };
  
  try {
    return DOMPurify.sanitize(content, config) as string;
  } catch (error) {
    console.error('HTML sanitization failed:', error);
    // Return empty string if sanitization fails
    return '';
  }
};

/**
 * Enhanced sanitization for user-generated content
 * More restrictive than general HTML sanitization
 */
export const sanitizeUserContent = (content: string): string => {
  return sanitizeHtml(content, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'i', 'b'],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'iframe', 'a', 'img'],
  });
};

/**
 * Validates and sanitizes URLs to prevent javascript: and data: URLs
 */
export const sanitizeUrl = (url: string): string => {
  const urlPattern = /^(https?:\/\/|\/|mailto:|tel:)/i;
  const dangerousPatterns = /^(javascript:|data:|vbscript:|file:)/i;
  
  if (dangerousPatterns.test(url)) {
    console.warn('Dangerous URL detected and blocked:', url);
    return '#';
  }
  
  if (!urlPattern.test(url)) {
    console.warn('Invalid URL pattern detected:', url);
    return '#';
  }
  
  return url;
};

/**
 * Security header middleware for edge functions
 */
export const getSecurityHeaders = () => ({
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
});

/**
 * Sanitizes CSS content to prevent CSS injection attacks
 */
export const sanitizeCss = (css: string): string => {
  // Remove dangerous CSS properties and functions
  const dangerousPatterns = [
    /javascript:/gi,
    /expression\s*\(/gi,
    /behavior\s*:/gi,
    /binding\s*:/gi,
    /@import/gi,
    /url\s*\(\s*javascript:/gi,
    /url\s*\(\s*data:/gi,
  ];
  
  let sanitized = css;
  dangerousPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '/* blocked */');
  });
  
  return sanitized;
};

/**
 * Rate limiting utility for edge functions
 */
export const createRateLimiter = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, number[]>();
  
  return (identifier: string): boolean => {
    const now = Date.now();
    const userRequests = requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return false; // Rate limit exceeded
    }
    
    validRequests.push(now);
    requests.set(identifier, validRequests);
    
    return true; // Request allowed
  };
};