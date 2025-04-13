input_file = "requirements.txt"
output_file = "requirements.out"

with open(input_file, "r") as infile, open(output_file, "w") as outfile:
    for line in infile:
        parts = line.split()
        if len(parts) == 2 and parts[0] != "Package":  # Skip headers
            outfile.write(f"{parts[0]}=={parts[1]}\n")

logging.info("Converted to requirements.txt")
