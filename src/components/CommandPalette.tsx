import { commandBindingDefinitions } from "#/commands"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import Text from "./Text"
import { useTheme } from "./ui/use-theme"

type CommandPaletteProps = {
  open: boolean
  handleOpenChange: React.Dispatch<React.SetStateAction<boolean>>
}

export default function CommandPalette({
  open,
  handleOpenChange,
}: CommandPaletteProps) {
  const tokens = useTheme()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogTitle content="COMMANDS" />
        {commandBindingDefinitions.map((command, commandIndex) => (
          <box key={command.cmd}>
            <Text>
              {commandIndex + 1} {command.title}
            </Text>
          </box>
        ))}
        {/*<DialogClose>
          <Text content="Close" />
        </DialogClose>*/}
      </DialogContent>
    </Dialog>
  )
}
