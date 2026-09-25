import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  FileText,
  Save,
  CheckCircle2,
  AlertCircle,
  Shield,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/features/portal/api';
import type { PortalProfile, PortalProfileUpdate } from '@/features/portal/api';

export const CustomerProfilePage: React.FC = () => {
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    isError,
    error,
  } = useQuery<PortalProfile>({
    queryKey: ['portal-profile'],
    queryFn: portalApi.getProfile,
  });

  const [formData, setFormData] = useState<PortalProfileUpdate>({
    name: '',
    phone: '',
    address: '',
    gstin: '',
    state: '',
  });

  // Sync state once profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        phone: profile.phone || '',
        address: profile.address || '',
        gstin: profile.gstin || '',
        state: profile.state || '',
      });
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: (updateData: PortalProfileUpdate) =>
      portalApi.updateProfile(updateData),
    onSuccess: (updated) => {
      queryClient.setQueryData(['portal-profile'], updated);
      toast.success('Profile updated successfully!', {
        description: 'Your contact and billing details have been saved.',
      });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.message || 'Failed to update profile.';
      toast.error('Update failed', {
        description: msg,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    updateMutation.mutate(formData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev: PortalProfileUpdate) => ({
      ...prev,
      [name]: value,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 rounded-xl border border-slate-800 max-w-4xl mx-auto my-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-4" />
        <p className="text-sm text-slate-400">Loading your profile information...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto my-12 bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center text-rose-300">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
        <p className="font-semibold">Unable to load profile</p>
        <p className="text-xs text-rose-400/80 mt-1">
          {(error as Error)?.message || 'An error occurred fetching your account info.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 sm:px-6 py-6 text-slate-100">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <User className="w-7 h-7 text-indigo-400" />
          Customer Profile & Account
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          View and update your personal contact, billing, and tax registration information.
        </p>
      </div>

      {/* Account Status Card */}
      <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-2xl">
            {profile?.name ? profile.name.charAt(0).toUpperCase() : 'C'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{profile?.name}</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Active Customer
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              {profile?.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 bg-slate-950/50 px-4 py-2 rounded-lg border border-slate-800">
          <Clock className="w-4 h-4 text-slate-500" />
          <span>
            Member since:{' '}
            <strong className="text-slate-200">
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'}
            </strong>
          </span>
        </div>
      </div>

      {/* Profile Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-xl shadow-lg overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="border-b border-slate-800/80 pb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Personal & Billing Information
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Email addresses cannot be self-updated. Contact support to change your account email.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Full Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. Rahul Sharma"
                />
              </div>
            </div>

            {/* Read-only Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-400 mb-1.5"
              >
                Email Address (Account Identifier)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-600 absolute left-3 top-3" />
                <input
                  type="email"
                  id="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full bg-slate-900/40 border border-slate-800/60 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-400 cursor-not-allowed"
                />
                <Shield className="w-4 h-4 text-slate-600 absolute right-3 top-3" />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label
                htmlFor="phone"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
            </div>

            {/* GSTIN */}
            <div>
              <label
                htmlFor="gstin"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                GSTIN (For Business / B2B Invoicing)
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  id="gstin"
                  name="gstin"
                  value={formData.gstin || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white uppercase placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  maxLength={15}
                />
              </div>
            </div>

            {/* State / Place of Supply */}
            <div className="sm:col-span-2">
              <label
                htmlFor="state"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                State / Place of Supply (GST Jurisdiction)
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={formData.state || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. Karnataka"
                />
              </div>
            </div>

            {/* Address */}
            <div className="sm:col-span-2">
              <label
                htmlFor="address"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Billing / Delivery Address
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <textarea
                  id="address"
                  name="address"
                  rows={3}
                  value={formData.address || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Street address, building, suite, city, postal code..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions Footer */}
        <div className="bg-slate-950/60 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" />
            Your data is strictly encrypted and isolated.
          </p>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-600/20"
          >
            {updateMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Saving Changes...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Profile
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CustomerProfilePage;
