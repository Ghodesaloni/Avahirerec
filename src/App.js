import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import Landing from "@/pages/landing";
import Login from "@/pages/LoginPage";
import Register from "@/pages/Register";
import VerifyEmail from "@/pages/VerifyEmail";
import ForgotPassword from "@/pages/forgetpassword";
import Features from "@/pages/Features";
import HowItWorks from "@/pages/Howitworks";
import About from "@/pages/aboutus";
import Contact from "@/pages/Contact";
import CandidateInterviewInvite from "@/pages/candidate/CandidateInterviewInvite";
import CandidateLogin from "@/pages/candidate/CandidateLogin";
import CandidateSystemCheck from "@/pages/candidate/CandidateSystemCheck";
import CandidateInstructions from "@/pages/candidate/CandidateInstructions";
import CandidateWaitingRoom from "@/pages/candidate/CandidateWaitingRoom";
import CandidateLiveRoom from "@/pages/candidate/CandidateLiveRoom";
import CandidateThankYou from "@/pages/candidate/CandidateThankYou";
import CandidateLinkExpired from "@/pages/candidate/CandidateLinkExpired";

import DashboardLayout from "@/components/DashboardLayout";
import Dashboard from "@/pages/dashboard/Dashboard";
import Jobs from "@/pages/dashboard/job";
import Resumes from "@/pages/dashboard/Resume";
import Candidates from "@/pages/dashboard/candidates";
import Interviewee from "@/pages/dashboard/Interviewee";
import Interviews from "@/pages/dashboard/interview";
import EmailCenter from "@/pages/dashboard/emailcenter";
import CalendarPage from "@/pages/dashboard/calenderpage";
import Settings from "@/pages/dashboard/settings";
import Profile from "@/pages/dashboard/Profile";
import ReportsDownloads from "@/pages/dashboard/ReportsDownloads";

const RequireAuth = ({ children }) => {
  const user = localStorage.getItem("avahire_user");
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/features" element={<Features />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Candidate AI Interview Portal */}
          <Route path="/i/:code" element={<CandidateInterviewInvite />} />
          <Route path="/i/:code/login" element={<CandidateLogin />} />
          <Route path="/i/:code/system-check" element={<CandidateSystemCheck />} />
          <Route path="/i/:code/instructions" element={<CandidateInstructions />} />
          <Route path="/i/:code/waiting-room" element={<CandidateWaitingRoom />} />
          <Route path="/i/:code/live" element={<CandidateLiveRoom />} />
          <Route path="/i/:code/thank-you" element={<CandidateThankYou />} />
          <Route path="/i/:code/expired" element={<CandidateLinkExpired />} />

          <Route path="/interview/:code" element={<CandidateInterviewInvite />} />
          <Route path="/interview/:code/login" element={<CandidateLogin />} />
          <Route path="/interview/:code/system-check" element={<CandidateSystemCheck />} />
          <Route path="/interview/:code/instructions" element={<CandidateInstructions />} />
          <Route path="/interview/:code/waiting-room" element={<CandidateWaitingRoom />} />
          <Route path="/interview/:code/live" element={<CandidateLiveRoom />} />
          <Route path="/interview/:code/thank-you" element={<CandidateThankYou />} />
          <Route path="/interview/:code/expired" element={<CandidateLinkExpired />} />

          <Route path="/interview" element={<CandidateInterviewInvite />} />
          <Route path="/candidate-portal" element={<CandidateLogin />} />
          <Route path="/candidate-portal/login" element={<CandidateLogin />} />
          <Route path="/candidate-portal/:code" element={<CandidateInterviewInvite />} />
          <Route path="/candidate-login" element={<CandidateLogin />} />
          <Route path="/system-check" element={<CandidateSystemCheck />} />
          <Route path="/instructions" element={<CandidateInstructions />} />
          <Route path="/waiting-room" element={<CandidateWaitingRoom />} />
          <Route path="/thank-you" element={<CandidateThankYou />} />
          <Route path="/expired" element={<CandidateLinkExpired />} />

          <Route
            path="/app"
            element={
              <RequireAuth>
                <DashboardLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="resumes" element={<Resumes />} />
            <Route path="candidates" element={<Candidates />} />
            <Route path="reports" element={<ReportsDownloads />} />
            <Route path="interviewee" element={<Navigate to="/app/interviews?tab=interviewee" replace />} />
            <Route path="interviewees" element={<Navigate to="/app/interviews?tab=interviewee" replace />} />
            <Route path="interviews" element={<Interviews />} />
            <Route path="email" element={<EmailCenter />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
            <Route path="notifications" element={<Navigate to="/app/dashboard?notifications=open" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
