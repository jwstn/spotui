import { useTheme } from "#/components/ui/use-theme"

type TextProps = {
  children?: React.ReactNode
  content?: string
}

export default function Text(props: TextProps) {
  const tokens = useTheme()
  return (
    <text content={props.content} fg={tokens.colors.foreground}>
      {props.children}
    </text>
  )
}
