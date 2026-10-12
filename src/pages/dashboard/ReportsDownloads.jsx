import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { reportsApi, candidatesApi } from "@/services/api";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  RefreshCw,
  Search,
  FileText,
  Volume2,
  ExternalLink,
  Sparkles,
  Info,
  AlertCircle,
  UserCheck
} from "lucide-react";

const ReportsDownloads = () => {
  const [summary, setSummary] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("avahire_user") || "{}");
    } catch {
      return {};
    }
  });

  const accountEmail = useMemo(() => {
    return (user?.email || localStorage.getItem("avahire_registered_email") || "").trim();
  }, [user]);

  const loadReportData = async () => {
    try {
      const emailParam = accountEmail ? { userEmail: accountEmail } : {};
      const [sumRes, datesRes, candRes] = await Promise.all([
        reportsApi.getSummary(emailParam).catch(() => ({ data: null })),
        reportsApi.getDates(emailParam).catch(() => ({ data: [] })),
        candidatesApi.getAll(emailParam).catch(() => [])
      ]);

      if (sumRes?.data) {
        setSummary(sumRes.data);
        if (!selectedDate && sumRes.data.todayDateKey) {
          setSelectedDate(sumRes.data.todayDateKey);
        }
      }

      if (Array.isArray(datesRes?.data)) {
        setAvailableDates(datesRes.data);
        if (!selectedDate && datesRes.data.length > 0) {
          setSelectedDate(datesRes.data[0].dateKey);
        }
      }

      if (Array.isArray(candRes)) {
        setCandidates(candRes);
      }
    } catch (err) {
      console.error("Failed to load reports data:", err);
      toast.error("Failed to load reports data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReportData();

    const handleCandidatesSync = () => {
      loadReportData();
    };

    const handleUserUpdate = (e) => {
      if (e.detail) {
        setUser(e.detail);
      } else {
        try {
          setUser(JSON.parse(localStorage.getItem("avahire_user") || "{}"));
        } catch {}
      }
    };

    window.addEventListener("avahire_candidates_updated", handleCandidatesSync);
    window.addEventListener("avahire_user_updated", handleUserUpdate);
    return () => {
      window.removeEventListener("avahire_candidates_updated", handleCandidatesSync);
      window.removeEventListener("avahire_user_updated", handleUserUpdate);
    };
  }, [accountEmail]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await reportsApi.regenerate(accountEmail).catch(() => {});
      await loadReportData();
      toast.success("Account reports refreshed and synchronized with database!");
    } catch (err) {
      toast.error("Failed to refresh reports");
      setRefreshing(false);
    }
  };

  const handleDownloadTodayReport = () => {
    const todayCount = summary?.todaySelectedCount || 0;
    if (todayCount === 0) {
      toast.info("Notice: No candidates were selected today for this account. Generating daily report template.");
    }
    const url = reportsApi.getTodayReportUrl(accountEmail);
    window.location.href = url;
  };

  const handleDownloadDateReport = () => {
    if (!selectedDate) {
      toast.error("Please select a date first");
      return;
    }
    const selectedEntry = availableDates.find((d) => d.dateKey === selectedDate);
    if (!selectedEntry || selectedEntry.candidateCount === 0) {
      toast.info(`No candidates were selected on ${selectedDate} for this account.`);
    }
    const url = reportsApi.getDateReportUrl(selectedDate, accountEmail);
    window.location.href = url;
  };

  const handleDownloadAllDatesReport = () => {
    const totalSelected = summary?.totalSelected || 0;
    if (totalSelected === 0) {
      toast.info("Notice: No selected candidates exist in this account yet.");
    }
    const url = reportsApi.getAllDatesReportUrl(accountEmail);
    window.location.href = url;
  };

  const handleDownloadTranscript = (candidateId, candidateName) => {
    const url = candidatesApi.getTranscriptDownloadUrl(candidateId);
    toast.success(`Downloading transcript (.docx) for ${candidateName}...`);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${candidateName.replace(/\s+/g, "_")}_Transcript.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadRecording = (candidateId, candidateName) => {
    const url = candidatesApi.getAudioDownloadUrl(candidateId);
    toast.success(`Downloading interview audio for ${candidateName}...`);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Recording_${candidateName.replace(/\s+/g, "_")}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Filter candidates for transcript/recording download table - ONLY SELECTED candidates
  const filteredCandidates = useMemo(() => {
    if (!Array.isArray(candidates)) return [];
    return candidates.filter((c) => {
      if (!c) return false;
      // Strictly show ONLY candidates with status "Selected"
      if (c.status !== "Selected" && c.status?.toLowerCase() !== "selected") return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.role?.toLowerCase().includes(q) ||
        c.department?.toLowerCase().includes(q)
      );
    });
  }, [candidates, searchQuery]);

  const selectedDateEntry = useMemo(() => {
    return availableDates.find((d) => d.dateKey === selectedDate) || null;
  }, [availableDates, selectedDate]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto -mt-2 pb-12" data-testid="reports-page">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <span>Reports</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Download daily selected candidate Excel spreadsheets, interview Word transcripts (.docx), and audio recordings for your account.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
            title="Regenerate reports for this account from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-600" : "text-slate-500"}`} />
            <span>{refreshing ? "Synchronizing..." : "Sync Reports"}</span>
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Today's Report */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Today's Selection Date</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                {summary?.todayDisplayDate || "11-Oct-2026"}
              </span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight pt-1">
              {summary?.todaySelectedCount ?? 0}
              <span className="text-xs font-medium text-slate-400 ml-1.5">selected candidates today</span>
            </div>
          </div>
          <button
            onClick={handleDownloadTodayReport}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>Download Today's Report (.xlsx)</span>
          </button>
        </div>

        {/* Card 2: Historical Date Selector */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Filter by Selection Date</span>
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            <div className="relative">
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {availableDates.length === 0 ? (
                  <option value="">No historical selection dates</option>
                ) : (
                  availableDates.map((d) => (
                    <option key={d.dateKey} value={d.dateKey}>
                      {d.displayDate} ({d.candidateCount} selected)
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="text-[11px] text-slate-500">
              {selectedDateEntry ? (
                <span>Contains <strong>{selectedEntryCount(selectedDateEntry)}</strong> candidates selected on this date</span>
              ) : (
                <span>Select a specific date to export daily records</span>
              )}
            </div>
          </div>
          <button
            onClick={handleDownloadDateReport}
            disabled={!selectedDate}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-[0.98] disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Download Date Report (.xlsx)</span>
          </button>
        </div>

        {/* Card 3: Master All-Dates Report */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Total Selected Across All Dates</span>
              <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 font-bold text-[11px]">
                {availableDates.length} Dates
              </span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 tracking-tight pt-1">
              {summary?.totalSelected ?? 0}
              <span className="text-xs font-medium text-slate-400 ml-1.5">all-time selected</span>
            </div>
          </div>
          <button
            onClick={handleDownloadAllDatesReport}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-[0.98]"
          >
            <Download className="w-4 h-4" />
            <span>Download Master Report (.xlsx)</span>
          </button>
        </div>
      </div>


      {/* Section 2: Candidate Interview Transcripts (.docx) & Audio Recordings Download Hub */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-600" />
                <span>Interview Transcripts & Audio Recordings Hub</span>
              </h3>
            </div>

          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search selected candidate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition"
            />
          </div>
        </div>

        {/* Table of Candidate Documents */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold bg-slate-50/60">
                <th className="py-3 px-4 rounded-l-xl">Candidate</th>
                <th className="py-3 px-4">Role / Department</th>
                <th className="py-3 px-4">Interview Date</th>
                <th className="py-3 px-4">Selection Date</th>
                <th className="py-3 px-4 text-center">Final Status</th>
                <th className="py-3 px-4 text-right rounded-r-xl">Downloads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-slate-400 space-y-1">
                    <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="font-semibold text-slate-600">No selected candidates found</div>
                    <div className="text-[11px] text-slate-400">
                      When candidates are marked as "Selected" on the Candidates evaluation page, their Word transcripts (.docx) and audio recordings will appear here.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((candidate) => {
                  return (
                    <tr key={candidate.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-3">
                          <img
                            src={candidate.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100"}
                            alt={candidate.name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                          <div>
                            <div>{candidate.name}</div>
                            <div className="text-[11px] text-slate-400 font-normal font-mono">{candidate.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-700">{candidate.role}</div>
                        <div className="text-[11px] text-slate-400">{candidate.department || "Engineering"}</div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                        {candidate.interviewDate || "N/A"}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {candidate.selectionDate ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                            {candidate.selectionDate}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Selected</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          Selected
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* Transcript Word Document Download */}
                          <button
                            onClick={() => handleDownloadTranscript(candidate.id, candidate.name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg font-bold text-[11px] border border-violet-200 transition cursor-pointer active:scale-95 shadow-2xs"
                            title="Download interview transcript Word document (.docx)"
                          >
                            <FileText className="w-3.5 h-3.5 text-violet-600" />
                            <span>Transcript (.docx)</span>
                          </button>

                          {/* Recording Audio Download */}
                          <button
                            onClick={() => handleDownloadRecording(candidate.id, candidate.name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] border border-indigo-200 transition cursor-pointer active:scale-95 shadow-2xs"
                            title="Download interview audio recording (.webm)"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Audio</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function selectedEntryCount(entry) {
  return entry?.candidateCount ?? 0;
}

export default ReportsDownloads;
