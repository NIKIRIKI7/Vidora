using System.Runtime.InteropServices;

namespace Integrations.Whisper.Native;

public static class CTranslate2Native
{
    public static bool IsCudaRuntimeAvailable()
    {
        if (!OperatingSystem.IsWindows()) return false;

        string[] candidateDlls = ["nvcuda.dll", "cudart64_12.dll", "cublas64_12.dll"];
        foreach (var dll in candidateDlls)
        {
            if (NativeLibrary.TryLoad(dll, out var handle))
            {
                NativeLibrary.Free(handle);
                return true;
            }
        }
        return false;
    }
}
