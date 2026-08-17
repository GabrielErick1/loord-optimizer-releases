# Advanced Windows Standby Cache & Working Set RAM Purger
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class RamOptimizerEngine {
    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out LUID lpLuid);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, uint BufferLengthInBytes, IntPtr PreviousState, IntPtr ReturnLength);

    [DllImport("psapi.dll")]
    public static extern bool EmptyWorkingSet(IntPtr hProcess);

    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("ntdll.dll")]
    public static extern int NtSetSystemInformation(int SystemInformationClass, ref int SystemInformation, int SystemInformationLength);

    [StructLayout(LayoutKind.Sequential)]
    public struct LUID {
        public uint LowPart;
        public int HighPart;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct TOKEN_PRIVILEGES {
        public uint PrivilegeCount;
        public LUID Luid;
        public uint Attributes;
    }

    public static bool EnablePrivilege(string privilege) {
        IntPtr hToken;
        if (OpenProcessToken(Process.GetCurrentProcess().Handle, 0x0028, out hToken)) {
            LUID luid;
            if (LookupPrivilegeValue(null, privilege, out luid)) {
                TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
                tp.PrivilegeCount = 1;
                tp.Luid = luid;
                tp.Attributes = 0x00000002; // SE_PRIVILEGE_ENABLED
                AdjustTokenPrivileges(hToken, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
                CloseHandle(hToken);
                return true;
            }
            CloseHandle(hToken);
        }
        return false;
    }

    public static void PurgeSystemMemory() {
        try {
            EnablePrivilege("SeProfileSingleProcessPrivilege");
            EnablePrivilege("SeIncreaseQuotaPrivilege");

            // 4 = MemoryPurgeStandbyList (Empties Windows Standby Cache)
            int cmdPurgeStandby = 4;
            NtSetSystemInformation(80, ref cmdPurgeStandby, 4);

            // 5 = MemoryPurgeLowPriorityStandbyList
            int cmdPurgeLowStandby = 5;
            NtSetSystemInformation(80, ref cmdPurgeLowStandby, 4);

            // 3 = MemoryFlushModifiedList
            int cmdFlushMod = 3;
            NtSetSystemInformation(80, ref cmdFlushMod, 4);

            // 2 = MemoryEmptyWorkingSets (System Working Sets)
            int cmdEmptyWS = 2;
            NtSetSystemInformation(80, ref cmdEmptyWS, 4);
        } catch {}
    }

    public static int CleanProcessWorkingSets() {
        Process[] processes = Process.GetProcesses();
        int count = 0;
        foreach (Process p in processes) {
            try {
                if (p.Id > 4) {
                    IntPtr h = OpenProcess(0x1F0FFF, false, (uint)p.Id);
                    if (h != IntPtr.Zero) {
                        if (EmptyWorkingSet(h)) count++;
                        CloseHandle(h);
                    }
                }
            } catch {}
        }
        return count;
    }
}
"@

try {
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    # 1. Trims Working Set of all processes
    $cleanedCount = [RamOptimizerEngine]::CleanProcessWorkingSets()
    
    # 2. Purges Kernel Standby List, Cache and System Working Sets
    [RamOptimizerEngine]::PurgeSystemMemory()

    # 3. Force Garbage Collector
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
} catch {}
