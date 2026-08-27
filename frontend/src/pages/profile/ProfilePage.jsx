import { useEffect, useRef, useState } from "react";

import UserAvatar from "../../components/profile/UserAvatar";
import { useAuth } from "../../context/AuthContext";
import {
  getOwnFarmerProfile,
  updateFarmerProfileImage,
} from "../../services/farmerProfileService";

const emptyAddress = {
  line1: "",
  line2: "",
  villageOrCity: "",
  district: "",
  state: "",
  pincode: "",
};

const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoSize = 3 * 1024 * 1024;
const fieldClassName =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const formatMemberSince = (dateValue) => {
  if (!dateValue) {
    return "Not available";
  }

  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
};

const Detail = ({ label, value }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
      {label}
    </dt>
    <dd className="mt-1.5 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
      {value || "Not provided"}
    </dd>
  </div>
);

export default function ProfilePage() {
  const { user, refreshUser, updateDeliveryAddress } = useAuth();
  const isFarmer = user?.role === "FARMER";
  const photoInputRef = useRef(null);
  const [address, setAddress] = useState(emptyAddress);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [farmerProfile, setFarmerProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState("");
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    setAddress({ ...emptyAddress, ...(user?.deliveryAddress || {}) });
  }, [user?.deliveryAddress]);

  useEffect(() => {
    if (!isFarmer) {
      return undefined;
    }

    let isActive = true;

    const loadProfile = async () => {
      setIsProfileLoading(true);
      setProfileError("");

      try {
        const response = await getOwnFarmerProfile();
        if (isActive) {
          setFarmerProfile(response.profile || null);
        }
      } catch (requestError) {
        if (isActive) {
          setProfileError(requestError.message || "We could not load your farm information.");
        }
      } finally {
        if (isActive) {
          setIsProfileLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      isActive = false;
    };
  }, [isFarmer]);

  useEffect(() => {
    if (!selectedPhoto) {
      setPhotoPreview("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(selectedPhoto);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedPhoto]);

  const resetPhotoSelection = () => {
    setSelectedPhoto(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const handlePhotoSelection = (event) => {
    const file = event.target.files?.[0];
    setPhotoFeedback("");
    setPhotoError("");

    if (!file) {
      resetPhotoSelection();
      return;
    }

    if (!allowedPhotoTypes.has(file.type)) {
      setPhotoError("Choose a JPEG, PNG, or WEBP image.");
      resetPhotoSelection();
      return;
    }

    if (file.size > maxPhotoSize) {
      setPhotoError("Choose an image that is 3 MB or smaller.");
      resetPhotoSelection();
      return;
    }

    setSelectedPhoto(file);
  };

  const handlePhotoSave = async () => {
    if (!selectedPhoto) {
      setPhotoError("Choose a profile photo first.");
      return;
    }

    setIsPhotoSaving(true);
    setPhotoFeedback("");
    setPhotoError("");

    try {
      await updateFarmerProfileImage(selectedPhoto);
      await refreshUser();
      resetPhotoSelection();
      setPhotoFeedback("Profile photo updated successfully.");
    } catch (requestError) {
      setPhotoError(requestError.message || "We could not update your profile photo.");
    } finally {
      setIsPhotoSaving(false);
    }
  };

  const handleAddressChange = (event) => {
    const { name, value } = event.target;
    setAddress((currentAddress) => ({ ...currentAddress, [name]: value }));
    setFeedback("");
    setError("");
  };

  const handleAddressSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback("");
    setError("");

    try {
      await updateDeliveryAddress(address);
      setFeedback("Delivery address saved. Your cart is ready for checkout.");
    } catch (requestError) {
      setError(requestError.message || "We could not save your delivery address.");
    } finally {
      setIsSaving(false);
    }
  };

  const farmLocation = [farmerProfile?.location?.district, farmerProfile?.location?.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar
            name={user?.name}
            imageUrl={photoPreview || user?.profileImage?.url}
            className="h-24 w-24 text-2xl ring-4 ring-emerald-100 dark:ring-emerald-950"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
              {isFarmer ? "Farmer profile" : "Customer profile"}
            </p>
            <h1 className="mt-2 truncate font-display text-3xl font-bold text-slate-950 dark:text-slate-50">
              {user?.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {isFarmer
                ? farmerProfile?.farmName || "Your AgroSphere farmer account"
                : "Your AgroSphere customer account"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                {user?.role}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Member since {formatMemberSince(user?.createdAt)}
              </span>
              {isFarmer && farmLocation ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  {farmLocation}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {isFarmer ? (
          <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelection}
              className="sr-only"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={isPhotoSaving}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
              >
                {user?.profileImage?.url ? "Choose new photo" : "Choose profile photo"}
              </button>
              {selectedPhoto ? (
                <>
                  <button
                    type="button"
                    onClick={handlePhotoSave}
                    disabled={isPhotoSaving}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPhotoSaving ? "Uploading..." : "Save photo"}
                  </button>
                  <button
                    type="button"
                    onClick={resetPhotoSelection}
                    disabled={isPhotoSaving}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-900 disabled:opacity-60 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Cancel
                  </button>
                  <span className="max-w-full truncate text-xs text-slate-500 dark:text-slate-400">
                    {selectedPhoto.name}
                  </span>
                </>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              JPEG, PNG, or WEBP. Maximum 3 MB. A square image works best.
            </p>
            {photoError ? (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {photoError}
              </p>
            ) : null}
            {photoFeedback ? (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                {photoFeedback}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={`grid gap-5 ${isFarmer ? "lg:grid-cols-2" : "lg:grid-cols-[0.75fr,1.25fr]"}`}>
        <article className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
            Personal information
          </h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Detail label="Name" value={user?.name} />
            <Detail label="Email" value={user?.email} />
            <Detail label="Role" value={user?.role} />
            <Detail label="Member since" value={formatMemberSince(user?.createdAt)} />
          </dl>
        </article>

        {isFarmer ? (
          <article className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                  Existing farm record
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
                  Farm information
                </h2>
              </div>
              {farmerProfile ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  {farmerProfile.averageRating || 0} / 5 · {farmerProfile.totalReviews || 0} reviews
                </span>
              ) : null}
            </div>

            {isProfileLoading ? (
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">Loading farm information...</p>
            ) : profileError ? (
              <p className="mt-5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {profileError}
              </p>
            ) : (
              <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                <Detail label="Farm name" value={farmerProfile?.farmName} />
                <Detail label="Location" value={farmLocation} />
                <div className="sm:col-span-2">
                  <Detail label="Farm bio" value={farmerProfile?.bio} />
                </div>
              </dl>
            )}
            <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Farm information is shown from your existing listing profile. This page does not change marketplace details.
            </p>
          </article>
        ) : (
          <article className="rounded-3xl border border-white/60 bg-white/85 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/75 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
                  Checkout ready
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold text-slate-950 dark:text-slate-50">
                  Delivery address
                </h2>
              </div>
              {user?.deliveryAddress ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Saved address
                </span>
              ) : null}
            </div>

            <form onSubmit={handleAddressSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Address line 1</span>
                <input name="line1" value={address.line1} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Address line 2 <span className="font-normal text-slate-400">(optional)</span></span>
                <input name="line2" value={address.line2} onChange={handleAddressChange} className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Village or city</span>
                <input name="villageOrCity" value={address.villageOrCity} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">District</span>
                <input name="district" value={address.district} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">State</span>
                <input name="state" value={address.state} onChange={handleAddressChange} required className={fieldClassName} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">6-digit pincode</span>
                <input name="pincode" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={address.pincode} onChange={handleAddressChange} required className={fieldClassName} />
              </label>

              {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 sm:col-span-2">{error}</p> : null}
              {feedback ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 sm:col-span-2">{feedback}</p> : null}

              <button type="submit" disabled={isSaving} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2">
                {isSaving ? "Saving address..." : "Save delivery address"}
              </button>
            </form>
          </article>
        )}
      </section>
    </div>
  );
}
