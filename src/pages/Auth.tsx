import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Phone, Mail } from 'lucide-react';

const Auth = () => {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState<'sms' | 'email'>('sms');
  const [otpSent, setOtpSent] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/');
      }
    };

    checkUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          navigate('/');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (authMethod === 'sms' && phone) {
        // SMS signup
        const { error } = await supabase.auth.signUp({
          phone,
          password,
        });

        if (error) {
          toast({
            title: "Sign up failed",
            description: error.message,
            variant: "destructive",
          });
        } else {
          setOtpSent(true);
          toast({
            title: "Verification code sent",
            description: "Check your phone for the verification code.",
          });
        }
      } else {
        // Email signup (backup method)
        const redirectUrl = `${window.location.origin}/`;
        
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl
          }
        });

        if (error) {
          if (error.message.includes('User already registered')) {
            toast({
              title: "Account exists",
              description: "An account with this email already exists. Please sign in instead.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Sign up failed",
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Check your email",
            description: "We've sent you a confirmation link to complete your registration.",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (authMethod === 'sms' && phone) {
        if (!otpSent) {
          // Send OTP
          const { error } = await supabase.auth.signInWithOtp({
            phone,
          });

          if (error) {
            toast({
              title: "Sign in failed",
              description: error.message,
              variant: "destructive",
            });
          } else {
            setOtpSent(true);
            toast({
              title: "Verification code sent",
              description: "Check your phone for the verification code.",
            });
          }
        } else {
          // Verify OTP
          const { error } = await supabase.auth.verifyOtp({
            phone,
            token: otpCode,
            type: 'sms'
          });

          if (error) {
            toast({
              title: "Verification failed",
              description: error.message,
              variant: "destructive",
            });
          }
        }
      } else {
        // Email signin
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: "Sign in failed",
              description: "Invalid email or password. Please check your credentials and try again.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Sign in failed",
              description: error.message,
              variant: "destructive",
            });
          }
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otpCode,
        type: 'sms'
      });

      if (error) {
        toast({
          title: "Verification failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Credit Dispute Assistant</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account or create a new one
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              {otpSent ? (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp-code">Verification Code</Label>
                    <Input
                      id="otp-code"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      maxLength={6}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Check your {authMethod === 'sms' ? 'phone' : 'email'} for the verification code
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Verifying..." : "Verify Code"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode('');
                    }}
                  >
                    Back to Sign In
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Auth Method Toggle */}
                  <div className="flex items-center justify-center space-x-2">
                    <Button
                      type="button"
                      variant={authMethod === 'sms' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAuthMethod('sms')}
                      className="flex items-center gap-2"
                    >
                      <Phone className="h-4 w-4" />
                      SMS
                    </Button>
                    <Button
                      type="button"
                      variant={authMethod === 'email' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAuthMethod('email')}
                      className="flex items-center gap-2"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </Button>
                  </div>
                  
                  <form onSubmit={handleSignIn} className="space-y-4">
                    {authMethod === 'sms' ? (
                      <div className="space-y-2">
                        <Label htmlFor="signin-phone">Phone Number <span className="text-red-500">*</span></Label>
                        <Input
                          id="signin-phone"
                          type="tel"
                          placeholder="+1234567890"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="signin-email">Email</Label>
                          <Input
                            id="signin-email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signin-password">Password</Label>
                          <div className="relative">
                            <Input
                              id="signin-password"
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter your password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Signing in..." : authMethod === 'sms' ? "Send Code" : "Sign In"}
                    </Button>
                  </form>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="signup">
              {otpSent ? (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-otp-code">Verification Code</Label>
                    <Input
                      id="signup-otp-code"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      maxLength={6}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Check your phone for the verification code
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Verifying..." : "Verify & Create Account"}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode('');
                    }}
                  >
                    Back to Sign Up
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Auth Method Toggle */}
                  <div className="flex items-center justify-center space-x-2">
                    <Button
                      type="button"
                      variant={authMethod === 'sms' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAuthMethod('sms')}
                      className="flex items-center gap-2"
                    >
                      <Phone className="h-4 w-4" />
                      SMS
                    </Button>
                    <Button
                      type="button"
                      variant={authMethod === 'email' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAuthMethod('email')}
                      className="flex items-center gap-2"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </Button>
                  </div>
                  
                  <form onSubmit={handleSignUp} className="space-y-4">
                    {authMethod === 'sms' ? (
                      <div className="space-y-2">
                        <Label htmlFor="signup-phone">Phone Number <span className="text-red-500">*</span></Label>
                        <Input
                          id="signup-phone"
                          type="tel"
                          placeholder="+1234567890"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required
                        />
                        <p className="text-sm text-muted-foreground">
                          Use international format (+1234567890)
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="signup-email">Email (Backup Method)</Label>
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="Enter your email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Create a password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Password must be at least 6 characters long
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Creating account..." : "Sign Up"}
                    </Button>
                  </form>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;