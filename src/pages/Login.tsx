import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Loader2, ShieldAlert, ArrowLeft } from "lucide-react";

// IMPORTANT: Enable Google OAuth in Supabase Dashboard > Authentication > Providers
// Configure Google Cloud Console OAuth credentials and add the Supabase callback URL.

interface LoginProps {
  accessDenied?: boolean;
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export default function Login({ accessDenied = false }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  // Preserve a same-origin `?next=` target through the auth round-trip so
  // OAuth-consent (and other deep links) return the user to the original URL.
  const nextParam = (() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("next");
      if (!raw) return null;
      // Only allow relative same-origin paths.
      if (!raw.startsWith("/") || raw.startsWith("//")) return null;
      return raw;
    } catch {
      return null;
    }
  })();
  const returnUrl = nextParam
    ? `${window.location.origin}${nextParam}`
    : window.location.origin;

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: returnUrl,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: returnUrl },
        });
        if (error) throw error;
        toast.success("Account created! You can now sign in.");
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (nextParam) {
          window.location.href = nextParam;
          return;
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };


  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent!");
      setIsForgot(false);
      setForgotEmail("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary glow-primary">
            <span className="text-xl font-bold text-primary-foreground">G</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">GetchüGear — Teleprompter Operations Portal</h1>
          <p className="text-sm text-muted-foreground">Promptin' Portal</p>
        </div>

        {accessDenied && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-destructive">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Access Denied</p>
                  <p className="text-sm text-destructive/80">
                    You must be added to the crew roster first. Contact your manager to get access.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Google Login Button */}
        <Button
          variant="outline"
          className="w-full gap-3 h-12 text-base font-medium border-border/50 hover:bg-muted/50"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <GoogleLogo />
          )}
          Continue with Google
        </Button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-3 text-muted-foreground">or</span>
          </div>
        </div>

        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-center">
              {isForgot ? "Reset Password" : isSignUp ? "Create Account" : "Sign In"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isForgot ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@getchugear.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="text-[16px] md:text-sm"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Send Reset Link
                </Button>
                <div className="text-center">
                  <button type="button" className="text-sm text-primary hover:underline flex items-center gap-1 mx-auto" onClick={() => setIsForgot(false)}>
                    <ArrowLeft className="h-3 w-3" /> Back to sign in
                  </button>
                </div>
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@getchugear.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="text-[16px] md:text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="text-[16px] md:text-sm"
                      minLength={6}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full glow-primary" disabled={loading}>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Lock className="h-4 w-4 mr-2" />
                    )}
                    {isSignUp ? "Create Account" : "Sign In"}
                  </Button>
                </form>
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:text-primary hover:underline"
                    onClick={() => setIsForgot(true)}
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="mt-2 text-center">
                  <button
                    type="button"
                    className="text-sm text-primary hover:underline"
                    onClick={() => setIsSignUp(!isSignUp)}
                  >
                    {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          You must be added to the crew roster by a manager before you can sign in.
        </p>
      </div>
    </div>
  );
}
