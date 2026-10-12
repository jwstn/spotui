import { useTheme } from "#/components/ui/use-theme"

type BorderBoxProps = {
  children: React.ReactNode
}

export default function BorderBox(props: BorderBoxProps) {
  const tokens = useTheme()
  return (
    <box
      width={24}
      flexDirection="column"
      padding={1}
      borderStyle="single"
      borderColor={tokens.colors.border}
    >
      {props.children}
    </box>
  )
}
