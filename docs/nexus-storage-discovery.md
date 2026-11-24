# Windows storage discovery

Run `Discover-Nexus-Storage.cmd` on the laptop to print reported logical drives and configured common-folder locations. This is the discovery portion of Computer → Drive → Folder → File navigation. It does not add locations to the Galaxy or change any existing folder grant.

The fixed PowerShell query reads Win32_LogicalDisk metadata, .NET special-folder paths, the current user's Downloads known-folder registry value and standard OneDrive environment locations. This respects redirected Documents/Pictures/Downloads rather than assuming they live directly under the user profile. Missing locations may be omitted. Duplicate aliases are retained as configured names. Removable/network/optical drive metadata may have unknown capacity; configured paths can be offline, inaccessible or cloud-backed. A reported drive or folder is not verified content access, sync completion or a successful filesystem read.

No directory recursion, file-content reads, indexing, model invocation, provider request, elevation, settings write or persisted inventory occurs. Output stays in the local terminal and includes private paths; it is not returned by a web API. The subprocess is bounded to fifteen seconds and 256 KB of output. Validation accepts only known folder categories and bounded absolute paths and drive metadata. Errors do not print raw subprocess output or environment variables.

`node scripts/storage-discovery.test.mjs` verifies parsing, redirected folders, unknown capacity, invalid/device paths and the exact fixed PowerShell invocation. These fixture tests do not establish Windows runtime compatibility; run the discovery command on the Windows host to observe its native inventory. It is intentionally separate from the paired file browser's current selected-root grants.

Browse-only storage selection is now available through `Setup-Nexus-Storage.cmd`; see `nexus-storage-browse.md`. The shared **Storage galaxy** view now renders selected-location and directory metadata inside the original spiral; see `nexus-storage-galaxy.md`. Do not silently add discovered drives to the knowledge index or grant remote controllers access to everything reported here. Phone-local storage and other hosts still require independent adapters.

The owner ran discovery successfully on Windows: reported C: and G: (Google Drive), redirected OneDrive common folders and Downloads. This confirms metadata discovery on that installation, not descendant access or cloud-file availability.
