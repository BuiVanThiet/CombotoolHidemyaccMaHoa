import { PowerShell } from 'node-powershell';

const ps = new PowerShell({
    executionPolicy: 'Bypass',
    noProfile: true
});

export async function showConfirm() {
    try {
        const script = `
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show('Gap su co khi chay tool?', 'Confirm', 'YesNo', 'Question')
`;

        const result = await ps.invoke(script);

        const answer = result.raw.toString().trim(); // lấy Yes hoặc No

        console.log("User clicked:", answer);

        return answer;

    } catch (err) {
        console.error(err);
    } finally {
        ps.dispose();
    }
}
