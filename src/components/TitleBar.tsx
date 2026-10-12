import Text from "./Text"

export default function TitleBar() {
  return (
    <box height={1} flexDirection="row" gap={1} paddingRight={1}>
      <Text>SPOTUI</Text>
      <box flexGrow={1} />
      <Text>/ or Ctrl-P commands q quit</Text>
    </box>
  )
}
