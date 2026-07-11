; Benben ERP — NSIS custom hooks (merged by electron-builder from project include path).
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!macro customInstall
  ; Post-install: release notes are shown in-app under Settings → Release Management
!macroend

!ifdef BUILD_UNINSTALLER
  !include "nsDialogs.nsh"

  Var DeleteBenbenUserData
  Var DeleteBenbenUserDataCheckbox
!endif

; Uninstaller welcome page with opt-in checkbox for AppData removal.
!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall Benben ERP"
  !define MUI_WELCOMEPAGE_TEXT "This will remove Benben ERP from your computer.$\r$\n$\r$\nYou can optionally delete local database files, backups, logs, and configuration stored on this device."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.BenbenDeleteDataShow
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.BenbenDeleteDataLeave
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!ifdef BUILD_UNINSTALLER

  Function un.BenbenDeleteDataShow
    ${NSD_CreateCheckbox} 0u 120u 100% 28u "Do you want to delete your local database and configuration files?"
    Pop $DeleteBenbenUserDataCheckbox
    ${NSD_Uncheck} $DeleteBenbenUserDataCheckbox
  FunctionEnd

  Function un.BenbenDeleteDataLeave
    ${NSD_GetState} $DeleteBenbenUserDataCheckbox $0
    StrCpy $DeleteBenbenUserData $0
  FunctionEnd
!endif

!macro customUnInit
  StrCpy $DeleteBenbenUserData ${BST_UNCHECKED}
!macroend

!macro customUnInstall
  ; Preserve user data during in-place upgrades / silent reinstalls.
  ${if} ${isUpdated}
    Goto benben_un_done
  ${endIf}

  ${If} $DeleteBenbenUserData == ${BST_CHECKED}
    SetShellVarContext current
    RMDir /r "$APPDATA\Benben ERP"
    RMDir /r "$APPDATA\NexusCore"
  ${EndIf}

  benben_un_done:
!macroend
