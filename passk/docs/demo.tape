# The no-key demo as a GIF, for the README and the video's terminal scene.
#   brew install vhs        (needs ttyd and ffmpeg, which brew pulls in)
#   cd passk && vhs docs/demo.tape
# Produces docs/demo.gif in about a minute. Nothing here touches Solari or a
# model: the scripted provider runs the real pipeline on in-memory desktops,
# paced so the forks and the gate can be read.

Output docs/demo.gif

Set Shell zsh
Set FontSize 15
Set Width 1180
Set Height 640
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type "export PASSK_SCRIPT_STEP_MS=700 PASSK_DEMO_NO_OPEN=1; clear"
Enter
Show

Type "sh demo.sh"
Sleep 800ms
Enter

# snapshot, verifier proven, ten forks, the summary, and the gate refusing an 80% agent
Sleep 28s

Type "open /tmp/passk-demo/fake-*/report.html    # the report, then the real evidence in evidence/"
Sleep 4s
