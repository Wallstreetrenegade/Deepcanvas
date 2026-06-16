import { useState } from 'react';
import { Menu, X } from 'lucide-react';

interface LandingPageProps {
  onSignUpClick?: () => void;
  onLoginClick?: () => void;
}

export function LandingPage({ onSignUpClick, onLoginClick }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignUp = () => {
    if (onSignUpClick) {
      onSignUpClick();
    }
  };

  const handleLogin = () => {
    if (onLoginClick) {
      onLoginClick();
    }
  };

  const handleExploreApp = () => {
    if (onSignUpClick) {
      onSignUpClick();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-md z-50 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-bold text-white text-lg">DeepCanvas</span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-300 hover:text-white transition">Features</a>
              <a href="#about" className="text-slate-300 hover:text-white transition">About</a>
              <button
                onClick={handleLogin}
                className="px-6 py-2 text-white hover:text-slate-100 transition"
              >
                Log In
              </button>
              <button
                onClick={handleSignUp}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/50 transition"
              >
                Sign Up
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4 border-t border-slate-700">
              <a href="#features" className="block py-2 text-slate-300 hover:text-white">Features</a>
              <a href="#about" className="block py-2 text-slate-300 hover:text-white">About</a>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleLogin}
                  className="flex-1 px-4 py-2 text-white hover:text-slate-100 transition"
                >
                  Log In
                </button>
                <button
                  onClick={handleSignUp}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-semibold"
                >
                  Sign Up
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-slate-800 rounded-full border border-slate-700">
            <span className="text-sm font-semibold text-blue-400">Welcome to DeepCanvas</span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6 leading-tight">
            Create, Collaborate, and Connect
          </h1>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            Experience the next generation of AI-powered creative and business tools. Transform your workflow with DeepCanvas.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleExploreApp}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/50 transition"
            >
              Explore App
            </button>
            <button
              onClick={handleSignUp}
              className="px-8 py-3 border-2 border-slate-600 text-white rounded-lg font-semibold hover:border-blue-400 hover:text-blue-400 transition"
            >
              Get Started
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-slate-700">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-16 text-center">Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Creative Studio',
                description: 'Design stunning visuals with our integrated creative tools',
                icon: '🎨',
              },
              {
                title: 'Social Station',
                description: 'Connect and collaborate with your team in real-time',
                icon: '🌐',
              },
              {
                title: 'Business Intelligence',
                description: 'Drive insights and growth with powerful analytics',
                icon: '📊',
              },
            ].map((feature, idx) => (
              <div key={idx} className="p-6 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-blue-500 transition">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to get started?</h2>
          <p className="text-blue-100 mb-8">Join thousands of users transforming their workflow with DeepCanvas.</p>
          <button
            onClick={handleSignUp}
            className="px-8 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition"
          >
            Create Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition">Features</a></li>
                <li><a href="#" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition">About</a></li>
                <li><a href="#" className="hover:text-white transition">Blog</a></li>
                <li><a href="#" className="hover:text-white transition">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="/privacy-policy" className="hover:text-white transition">Privacy</a></li>
                <li><a href="/terms-of-service" className="hover:text-white transition">Terms</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Connect</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-white transition">Twitter</a></li>
                <li><a href="#" className="hover:text-white transition">Discord</a></li>
                <li><a href="#" className="hover:text-white transition">GitHub</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center text-slate-500 text-sm">
            <p>&copy; 2026 DeepCanvas. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
