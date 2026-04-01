import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  outerGuideColor: string;
  innerGuideColor: string;
  showAllCompanies: boolean;
  preferredCompanies: string[];
  setOuterGuideColor: (color: string) => void;
  setInnerGuideColor: (color: string) => void;
  toggleCompany: (companyId: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      outerGuideColor: "#ef4444",
      innerGuideColor: "#3b82f6",
      showAllCompanies: true,
      preferredCompanies: ["psa", "bgs", "cgc", "sgc", "tag", "ace"],
      setOuterGuideColor: (outerGuideColor) => set({ outerGuideColor }),
      setInnerGuideColor: (innerGuideColor) => set({ innerGuideColor }),
      toggleCompany: (companyId) =>
        set((state) => {
          const has = state.preferredCompanies.includes(companyId);
          return {
            preferredCompanies: has
              ? state.preferredCompanies.filter((id) => id !== companyId)
              : [...state.preferredCompanies, companyId],
          };
        }),
    }),
    { name: "centering-settings" }
  )
);
