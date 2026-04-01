export function SettingsPanel() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-muted-foreground">
          Customize the app to your preferences.
        </p>
      </div>

      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Guide line colors can be changed in the Scanner sidebar.</p>
        <p className="text-sm mt-1">More settings coming soon.</p>
      </div>
    </div>
  );
}
