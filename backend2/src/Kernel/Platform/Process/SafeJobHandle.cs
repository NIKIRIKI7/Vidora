using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Kernel.Platform.Process;

internal sealed class SafeJobHandle : SafeHandleZeroOrMinusOneIsInvalid
{
    public SafeJobHandle() : base(true) { }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);

    protected override bool ReleaseHandle()
    {
        return CloseHandle(handle);
    }
}
