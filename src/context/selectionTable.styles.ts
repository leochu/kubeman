import { Theme, createStyles } from '@material-ui/core/styles'

const styles = ({ palette, spacing, typography }: Theme) => createStyles({
  root: {
    padding: spacing.unit,
    color: palette.primary.main,
  },
  formControl: {
    margin: spacing.unit * 0.9,
    padding: spacing.unit * 0.7,
  },
  table: {
    minWidth: 400,
  },
  tableCell: {
    margin: 0,
    padding: 0,
  },
  heading: {
    fontSize: typography.pxToRem(15),
    fontWeight: typography.fontWeightRegular,
  },
  secondaryHeading: {
    fontSize: typography.pxToRem(12),
    color: palette.text.secondary,
    marginLeft: 10,
    marginTop: 2,
  },
})

export default styles